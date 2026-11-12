import os
import posixpath
import sys
import json
from pathlib import PurePosixPath
from typing import Dict, List, Optional, Set, Tuple
from schemas.graph import ResolutionType


class ResolverService:
    def __init__(self, file_paths: Set[str], config_files: Dict[str, str] = None):
        """
        :param file_paths: Set of canonical relative file paths in repository (e.g. 'src/app.ts')
        :param config_files: Dict of config file path -> file content (e.g. 'tsconfig.json' -> content)
        """
        self.file_paths: Set[str] = {self.normalize_path(p) for p in file_paths}
        self.config_files: Dict[str, str] = config_files or {}
        self.alias_mappings: Dict[str, List[str]] = {}
        self.base_url: str = "."
        self._parse_tsconfig()

        # Cache Python standard library names
        self.py_stdlib: Set[str] = getattr(sys, "stdlib_module_names", {
            "os", "sys", "json", "time", "datetime", "math", "random", "re",
            "typing", "pathlib", "collections", "itertools", "functools",
            "asyncio", "logging", "hashlib", "uuid", "abc", "copy"
        })

    @staticmethod
    def normalize_path(path: str) -> str:
        """Convert any path to canonical forward-slash relative posix path without redundant .. or ."""
        p = path.replace("\\", "/").strip()
        p = posixpath.normpath(p)
        if p.startswith("./"):
            p = p[2:]
        if p == ".":
            return ""
        return p

    def _parse_tsconfig(self):
        """Extract baseUrl and paths mappings from tsconfig.json if present."""
        for name in ["tsconfig.json", "tsconfig.base.json"]:
            if name in self.config_files:
                try:
                    data = json.loads(self.config_files[name])
                    opts = data.get("compilerOptions", {})
                    self.base_url = self.normalize_path(opts.get("baseUrl", "."))
                    paths = opts.get("paths", {})
                    for alias, targets in paths.items():
                        self.alias_mappings[alias] = [self.normalize_path(t) for t in targets]
                except Exception:
                    pass

    def resolve_ts_import(self, importing_file: str, raw_import: str) -> Tuple[str, ResolutionType, bool, bool]:
        """
        Resolve a TypeScript/JavaScript import statement.
        Returns: (target_node_id, resolution_type, is_resolved, is_dynamic)
        """
        importer = self.normalize_path(importing_file)
        import_str = raw_import.strip()

        # Check for dynamic imports
        is_dynamic = import_str.startswith("import(") or "(" in import_str
        if is_dynamic:
            clean_str = import_str.replace("import(", "").replace("require(", "").rstrip(")").strip("'\"`")
            return f"unresolved:{importer}:{clean_str}", ResolutionType.DYNAMIC, False, True

        clean_import = import_str.strip("'\"`;")

        # 1. Relative import (./ or ../)
        if clean_import.startswith("./") or clean_import.startswith("../"):
            importer_dir = posixpath.dirname(importer)
            target_candidate = posixpath.normpath(posixpath.join(importer_dir, clean_import))
            target_candidate = self.normalize_path(target_candidate)

            resolved = self._find_matching_file(target_candidate)
            if resolved:
                return resolved, ResolutionType.RELATIVE, True, False
            return f"unresolved:{importer}:{clean_import}", ResolutionType.UNRESOLVED, False, False

        # 2. Path Aliases (tsconfig paths)
        for pattern, targets in self.alias_mappings.items():
            if pattern.endswith("/*") and clean_import.startswith(pattern[:-2] + "/"):
                suffix = clean_import[len(pattern[:-2]) + 1:]
                for target_prefix in targets:
                    prefix_clean = target_prefix[:-2] if target_prefix.endswith("/*") else target_prefix
                    candidate = f"{prefix_clean}/{suffix}"
                    if self.base_url and self.base_url != ".":
                        candidate = f"{self.base_url}/{candidate}"
                    candidate = self.normalize_path(candidate)
                    resolved = self._find_matching_file(candidate)
                    if resolved:
                        return resolved, ResolutionType.TSCONFIG_ALIAS, True, False

        # 3. External npm package
        pkg_name = clean_import.split("/")[0]
        if clean_import.startswith("@"):
            parts = clean_import.split("/")
            pkg_name = f"{parts[0]}/{parts[1]}" if len(parts) > 1 else clean_import

        return f"pkg:{pkg_name}", ResolutionType.EXTERNAL, True, False

    def resolve_py_import(self, importing_file: str, raw_import: str, is_from: bool = False, level: int = 0) -> Tuple[str, ResolutionType, bool, bool]:
        """
        Resolve a Python import statement.
        :param importing_file: File making the import
        :param raw_import: Module name (e.g. '.utils' or 'os' or 'models.user')
        :param level: Relative level dots (e.g. 1 for '.', 2 for '..')
        """
        importer = self.normalize_path(importing_file)
        clean = raw_import.strip()

        # 1. Relative import
        if level > 0 or clean.startswith("."):
            dots = level if level > 0 else len(clean) - len(clean.lstrip("."))
            mod_path = clean.lstrip(".")
            importer_parts = list(PurePosixPath(importer).parent.parts)
            
            # Navigate up
            for _ in range(dots - 1):
                if importer_parts:
                    importer_parts.pop()

            candidate_base = "/".join(importer_parts) if importer_parts else ""
            candidate = f"{candidate_base}/{mod_path.replace('.', '/')}" if candidate_base else mod_path.replace(".", "/")
            candidate = self.normalize_path(candidate)

            resolved = self._find_matching_file(candidate, extensions=[".py", "/__init__.py"])
            if resolved:
                return resolved, ResolutionType.PYTHON_PACKAGE, True, False
            return f"unresolved:{importer}:{clean}", ResolutionType.UNRESOLVED, False, False

        # 2. Standard library
        top_module = clean.split(".")[0]
        if top_module in self.py_stdlib:
            return f"pkg:{top_module}", ResolutionType.PYTHON_STDLIB, True, False

        # 3. Internal absolute import against repo root
        candidate = clean.replace(".", "/")
        resolved = self._find_matching_file(candidate, extensions=[".py", "/__init__.py"])
        if resolved:
            return resolved, ResolutionType.PYTHON_PACKAGE, True, False

        # 4. Third-party package
        return f"pkg:{top_module}", ResolutionType.EXTERNAL, True, False

    def _find_matching_file(self, candidate_base: str, extensions: List[str] = None) -> Optional[str]:
        """Check if candidate path matches any actual file with valid extensions."""
        exts = extensions or [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", ""]
        clean_base = self.normalize_path(candidate_base)
        for ext in exts:
            attempt = self.normalize_path(clean_base + ext)
            if attempt in self.file_paths:
                return attempt
        return None
