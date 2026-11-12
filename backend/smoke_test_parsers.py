"""
Smoke test suite for Tree-sitter core and language grammars.
Tests TypeScript, TSX, and Python AST parsing in Python 3.11+.
"""

import sys
from tree_sitter import Language, Parser
import tree_sitter_typescript as tstypescript
import tree_sitter_python as tspython


def test_typescript_parser():
    print("Testing TypeScript Parser...")
    ts_language = Language(tstypescript.language_typescript())
    parser = Parser(ts_language)

    ts_source = b"""
    import { Router, Request, Response } from 'express';
    import { AuthService } from '../services/auth';

    export interface UserPayload {
        id: string;
        roles: string[];
    }

    export class AuthController {
        constructor(private readonly authService: AuthService) {}

        public async login(req: Request, res: Response): Promise<void> {
            const token = await this.authService.signToken(req.body);
            res.json({ token });
        }
    }
    """
    tree = parser.parse(ts_source)
    root = tree.root_node
    assert root.type == "program", f"Expected 'program', got {root.type}"
    assert not root.has_error, "TS parser encountered syntax errors on valid snippet"

    # Verify extraction of import statement
    imports = [child for child in root.children if child.type == "import_statement"]
    assert len(imports) == 2, f"Expected 2 import statements, found {len(imports)}"
    print("✓ TypeScript parser passed smoke test.")


def test_tsx_parser():
    print("Testing TSX Parser...")
    tsx_language = Language(tstypescript.language_tsx())
    parser = Parser(tsx_language)

    tsx_source = b"""
    import React from 'react';

    export const ArchitectureNode: React.FC<{ name: string; loc: number }> = ({ name, loc }) => {
        return (
            <div className="p-4 bg-white border border-plum rounded-lg shadow-sm">
                <span className="font-semibold text-cherry">{name}</span>
                <span className="text-sm text-lavender">{loc} lines</span>
            </div>
        );
    };
    """
    tree = parser.parse(tsx_source)
    root = tree.root_node
    assert root.type == "program", f"Expected 'program', got {root.type}"
    assert not root.has_error, "TSX parser encountered syntax errors on valid snippet"

    jsx_elements = []
    def find_jsx(node):
        if "jsx" in node.type:
            jsx_elements.append(node)
        for child in node.children:
            find_jsx(child)
    find_jsx(root)

    assert len(jsx_elements) > 0, "Expected to find JSX elements in parsed TSX tree"
    print("✓ TSX parser passed smoke test.")


def test_python_parser():
    print("Testing Python Parser...")
    py_language = Language(tspython.language())
    parser = Parser(py_language)

    py_source = b"""
    import os
    from typing import Dict, List, Optional
    from pydantic import BaseModel
    from .service import GraphService

    class FileNode(BaseModel):
        id: str
        cluster_id: str
        loc: int

    async def analyze_repository(owner: str, repo: str) -> Dict[str, str]:
        service = GraphService()
        return await service.build_graph(owner, repo)
    """
    tree = parser.parse(py_source)
    root = tree.root_node
    assert root.type == "module", f"Expected 'module', got {root.type}"
    assert not root.has_error, "Python parser encountered syntax errors on valid snippet"

    classes = [child for child in root.children if child.type == "class_definition"]
    functions = [child for child in root.children if child.type == "function_definition"]
    assert len(classes) == 1, f"Expected 1 class, found {len(classes)}"
    assert len(functions) == 1, f"Expected 1 function, found {len(functions)}"
    print("✓ Python parser passed smoke test.")


if __name__ == "__main__":
    try:
        test_typescript_parser()
        test_tsx_parser()
        test_python_parser()
        print("\n=== ALL TREE-SITTER PARSER SMOKE TESTS PASSED ===")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Parser smoke test failure: {e}", file=sys.stderr)
        sys.exit(1)
