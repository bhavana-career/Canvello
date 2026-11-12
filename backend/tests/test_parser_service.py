import pytest
from services.parser_service import ParserService


def test_parse_typescript_clean():
    parser = ParserService()
    ts_code = b"""
    import { Router } from 'express';
    export class AuthRouter {
        public router: Router;
    }
    """
    info = parser.parse_file("src/routes/auth.ts", ts_code)
    assert info.is_valid is True
    assert info.has_syntax_errors is False
    assert len(info.raw_imports) == 1
    assert "AuthRouter" in info.symbols
    assert "AuthRouter" in info.exports


def test_parse_tsx_clean():
    parser = ParserService()
    tsx_code = b"""
    import React from 'react';
    export const Widget = () => <div>Hello</div>;
    """
    info = parser.parse_file("src/components/Widget.tsx", tsx_code)
    assert info.is_valid is True
    assert "Widget" in info.symbols


def test_parse_malformed_syntax_graceful():
    parser = ParserService()
    broken_code = b"""
    export function broken( {
        const x = 10;
    """
    info = parser.parse_file("src/broken.ts", broken_code)
    # Parser should not crash; it flags syntax error
    assert info.has_syntax_errors is True
    assert info.loc == 4
