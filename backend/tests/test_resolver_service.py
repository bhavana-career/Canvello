import pytest
from schemas.graph import ResolutionType
from services.resolver_service import ResolverService


def test_relative_import_resolution():
    files = {"src/app.ts", "src/routes/auth.ts", "src/controllers/auth.controller.ts"}
    resolver = ResolverService(files)

    # Relative import from routes to controller
    target, res_type, is_res, is_dyn = resolver.resolve_ts_import(
        "src/routes/auth.ts",
        "../controllers/auth.controller"
    )
    assert is_res is True
    assert target == "src/controllers/auth.controller.ts"
    assert res_type == ResolutionType.RELATIVE
    assert is_dyn is False


def test_tsconfig_alias_resolution():
    files = {"src/app.ts", "src/components/Button.tsx", "src/utils/logger.ts"}
    configs = {
        "tsconfig.json": """
        {
            "compilerOptions": {
                "baseUrl": ".",
                "paths": {
                    "@/*": ["src/*"]
                }
            }
        }
        """
    }
    resolver = ResolverService(files, configs)

    target, res_type, is_res, is_dyn = resolver.resolve_ts_import(
        "src/app.ts",
        "@/components/Button"
    )
    assert is_res is True
    assert target == "src/components/Button.tsx"
    assert res_type == ResolutionType.TSCONFIG_ALIAS


def test_unresolved_import_handling():
    files = {"src/app.ts"}
    resolver = ResolverService(files)

    target, res_type, is_res, is_dyn = resolver.resolve_ts_import(
        "src/app.ts",
        "./ghost_module"
    )
    assert is_res is False
    assert target.startswith("unresolved:src/app.ts:")
    assert res_type == ResolutionType.UNRESOLVED


def test_dynamic_import_detection():
    files = {"src/app.ts"}
    resolver = ResolverService(files)

    target, res_type, is_res, is_dyn = resolver.resolve_ts_import(
        "src/app.ts",
        "import(`./plugins/${name}`)"
    )
    assert is_res is False
    assert is_dyn is True
    assert res_type == ResolutionType.DYNAMIC


def test_python_stdlib_detection():
    files = {"app.py"}
    resolver = ResolverService(files)

    target, res_type, is_res, is_dyn = resolver.resolve_py_import("app.py", "os")
    assert target == "pkg:os"
    assert res_type == ResolutionType.PYTHON_STDLIB
    assert is_res is True


def test_python_relative_import():
    files = {"pkg/__init__.py", "pkg/utils.py", "pkg/sub/module.py"}
    resolver = ResolverService(files)

    target, res_type, is_res, is_dyn = resolver.resolve_py_import(
        "pkg/sub/module.py",
        "utils",
        level=2
    )
    assert target == "pkg/utils.py"
    assert res_type == ResolutionType.PYTHON_PACKAGE
    assert is_res is True
