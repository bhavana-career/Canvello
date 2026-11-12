from typing import Dict, List, Optional, Tuple
from tree_sitter import Language, Parser
import tree_sitter_typescript as tstypescript
import tree_sitter_python as tspython


class ParsedFileInfo:
    def __init__(self, path: str):
        self.path: str = path
        self.loc: int = 0
        self.symbols: List[str] = []
        self.exports: List[str] = []
        self.raw_imports: List[Tuple[str, str, bool]] = []  # (import_statement, module_target, is_dynamic)
        self.is_valid: bool = True
        self.has_syntax_errors: bool = False
        self.error_message: Optional[str] = None


class ParserService:
    def __init__(self):
        # Initialize modern Tree-sitter parsers
        self.ts_lang = Language(tstypescript.language_typescript())
        self.tsx_lang = Language(tstypescript.language_tsx())
        self.py_lang = Language(tspython.language())

        self.ts_parser = Parser(self.ts_lang)
        self.tsx_parser = Parser(self.tsx_lang)
        self.py_parser = Parser(self.py_lang)

    def parse_file(self, file_path: str, content: bytes) -> ParsedFileInfo:
        info = ParsedFileInfo(file_path)
        info.loc = len(content.splitlines())

        ext = file_path.split(".")[-1].lower() if "." in file_path else ""

        try:
            if ext in ["ts", "js", "mjs", "cjs"]:
                tree = self.ts_parser.parse(content)
                self._extract_js_ts_ast(tree.root_node, content, info)
            elif ext in ["tsx", "jsx"]:
                tree = self.tsx_parser.parse(content)
                self._extract_js_ts_ast(tree.root_node, content, info)
            elif ext == "py":
                tree = self.py_parser.parse(content)
                self._extract_py_ast(tree.root_node, content, info)
            else:
                # Unsupported language or text config
                info.is_valid = True
                return info

            if tree.root_node.has_error:
                info.has_syntax_errors = True
        except Exception as e:
            info.is_valid = False
            info.has_syntax_errors = True
            info.error_message = str(e)

        return info

    def _extract_js_ts_ast(self, root_node, content: bytes, info: ParsedFileInfo):
        def visit(node):
            node_type = node.type

            # Imports
            if node_type == "import_statement":
                stmt_text = content[node.start_byte:node.end_byte].decode("utf-8", errors="replace").strip()
                source_node = node.child_by_field_name("source")
                if source_node:
                    raw_target = content[source_node.start_byte:source_node.end_byte].decode("utf-8", errors="replace")
                    info.raw_imports.append((stmt_text, raw_target, False))

            # Call expressions (e.g. require() or dynamic import())
            elif node_type == "call_expression":
                func_node = node.child_by_field_name("function")
                if func_node:
                    func_name = content[func_node.start_byte:func_node.end_byte].decode("utf-8", errors="replace")
                    if func_name in ["require", "import"]:
                        args = node.child_by_field_name("arguments")
                        if args and args.named_child_count > 0:
                            arg_node = args.named_children[0]
                            raw_target = content[arg_node.start_byte:arg_node.end_byte].decode("utf-8", errors="replace")
                            stmt_text = content[node.start_byte:node.end_byte].decode("utf-8", errors="replace").strip()
                            is_dynamic = func_name == "import" or arg_node.type != "string"
                            info.raw_imports.append((stmt_text, raw_target, is_dynamic))

            # Exports & Declarations
            elif node_type in ["export_statement", "export_declaration"]:
                decl = node.child_by_field_name("declaration")
                if decl:
                    if decl.type in ["lexical_declaration", "variable_declaration"]:
                        for child in decl.children:
                            if child.type == "variable_declarator":
                                name_node = child.child_by_field_name("name")
                                if name_node:
                                    name = content[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="replace")
                                    info.exports.append(name)
                                    info.symbols.append(name)
                    else:
                        name_node = decl.child_by_field_name("name")
                        if name_node:
                            name = content[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="replace")
                            info.exports.append(name)
                            info.symbols.append(name)

            # Class, Function, Interface declarations
            elif node_type in ["class_declaration", "function_declaration", "interface_declaration", "type_alias_declaration"]:
                name_node = node.child_by_field_name("name")
                if name_node:
                    name = content[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="replace")
                    info.symbols.append(name)

            for child in node.children:
                visit(child)

        visit(root_node)

    def _extract_py_ast(self, root_node, content: bytes, info: ParsedFileInfo):
        def visit(node):
            node_type = node.type

            # Import: import os, sys
            if node_type == "import_statement":
                stmt_text = content[node.start_byte:node.end_byte].decode("utf-8", errors="replace").strip()
                for child in node.children:
                    if child.type == "dotted_name":
                        mod_name = content[child.start_byte:child.end_byte].decode("utf-8", errors="replace")
                        info.raw_imports.append((stmt_text, mod_name, False))

            # Import From: from .utils import helper
            elif node_type == "import_from_statement":
                stmt_text = content[node.start_byte:node.end_byte].decode("utf-8", errors="replace").strip()
                mod_name_node = node.child_by_field_name("module_name")
                if mod_name_node:
                    mod_name = content[mod_name_node.start_byte:mod_name_node.end_byte].decode("utf-8", errors="replace")
                    info.raw_imports.append((stmt_text, mod_name, False))
                else:
                    # e.g. from . import x
                    info.raw_imports.append((stmt_text, ".", False))

            # Class & Function definitions
            elif node_type in ["class_definition", "function_definition"]:
                name_node = node.child_by_field_name("name")
                if name_node:
                    name = content[name_node.start_byte:name_node.end_byte].decode("utf-8", errors="replace")
                    info.symbols.append(name)
                    info.exports.append(name)

            for child in node.children:
                visit(child)

        visit(root_node)
