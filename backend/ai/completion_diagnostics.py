"""Content-free diagnostics for rejected provider completions.

Never serialize exceptions, validation messages/inputs/context, dynamic map keys,
prompts or completion text. Field paths come only from the declared JSON schema.
"""
import logging
from uuid import uuid4
from pydantic import ValidationError

logger = logging.getLogger(__name__)
_FINISH_REASONS = {'stop', 'length', 'content_filter', 'tool_calls', 'function_call'}
_ERROR_TYPES = {
    'missing', 'extra_forbidden', 'int_type', 'string_type', 'literal_error',
    'string_too_long', 'string_too_short', 'too_long', 'too_short', 'json_invalid',
    'model_type', 'model_attributes_type', 'list_type', 'dict_type', 'float_type',
    'bool_type', 'none_required', 'finite_number', 'greater_than',
    'greater_than_equal', 'less_than', 'less_than_equal', 'value_error',
}


def _type(value):
    return {type(None): 'null', bool: 'boolean', int: 'integer', float: 'number',
            str: 'string', list: 'array', dict: 'object'}.get(type(value), 'other')


def _resolve(node, root):
    # Only references into a server-owned Pydantic schema, never provider data.
    if '$ref' in node:
        node = root['$defs'][node['$ref'].rsplit('/', 1)[-1]]
    return node


def _expected(node, root):
    node = _resolve(node, root)
    if 'anyOf' in node:
        return '|'.join(_expected(part, root) for part in node['anyOf'])
    if 'enum' in node:
        return 'enum<' + node.get('type', 'value') + '>'
    return node.get('type', 'forbidden_field')


def _field_path(location, root):
    node, path = root, '$'
    for part in location:
        node = _resolve(node, root)
        if 'anyOf' in node:
            node = next((_resolve(n, root) for n in node['anyOf'] if n.get('type') != 'null'), {})
        properties = node.get('properties', {})
        if isinstance(part, str) and part in properties:
            path += '.' + part
            node = properties[part]
        elif isinstance(part, int) and node.get('type') == 'array':
            path += '[]'
            node = node.get('items', {})
        else:
            # Extra fields, arbitrary profile-evidence map keys, union labels.
            path += '.*'
            additional = node.get('additionalProperties')
            node = additional if isinstance(additional, dict) else {}
    return path, _expected(node, root)


class CompletionDiagnostics:
    def __init__(self, schema, completion_token_limit):
        self.schema = schema
        self.completion_token_limit = completion_token_limit
        self.completion_tokens = None
        self.content_present = None
        self.refusal_present = None
        self.correlation_id = uuid4().hex
        self.provider_request_id = None
        self.finish_reason = None
        self.provider_response_received = False

    def observe(self, response, safe_token):
        self.provider_response_received = True
        self.provider_request_id = safe_token(getattr(response, '_request_id', None))
        tokens = getattr(getattr(response, 'usage', None), 'completion_tokens', None)
        self.completion_tokens = tokens if type(tokens) is int and 0 <= tokens <= 10**9 else None

    def invalid(self, category, *, validation=None):
        record = {
            'category': category,
            'schema': self.schema.__name__,
            'correlation_id': self.correlation_id,
            'provider_request_id': self.provider_request_id,
            'finish_reason': self.finish_reason,
            'content_present': self.content_present,
            'refusal_present': self.refusal_present,
            'completion_token_limit': self.completion_token_limit,
            'completion_tokens': self.completion_tokens,
            'response_status': 502,
            # Typed SDK return establishes success, but not the exact HTTP code.
            'upstream_status_class': '2xx' if self.provider_response_received else None,
            'validation_errors': [],
            'validation_errors_truncated': False,
        }
        if validation is not None:
            root = self.schema.model_json_schema()
            # Input is inspected ONLY for its Python type and never serialized.
            for error in validation.errors(include_context=False, include_url=False)[:12]:
                code = error['type']
                path, expected = _field_path(error['loc'], root)
                record['validation_errors'].append({
                    'path': path,
                    'error_type': code if code in _ERROR_TYPES else 'other_validation_error',
                    'expected_type': expected,
                    'received_type': 'missing' if code == 'missing' else _type(error.get('input')),
                })
            record['validation_errors_truncated'] = validation.error_count() > 12
        logger.warning('Meta completion rejected %s', record)
        from backend.ai.service import fail
        error = fail(502, 'ai_invalid_response', 'Meta AI returned an invalid response. No changes were applied.')
        error.detail['request_id'] = self.correlation_id
        error.headers = {'X-Request-ID': self.correlation_id}
        raise error from None

    def parse(self, response):
        try:
            choice = response.choices[0]
            reason = choice.finish_reason
            self.finish_reason = reason if isinstance(reason, str) and reason in _FINISH_REASONS else 'other'
            message = choice.message
            refusal = message.refusal
            content = message.content
            self.content_present = isinstance(content, str) and bool(content)
            self.refusal_present = bool(refusal)
        except (IndexError, AttributeError, TypeError):
            self.invalid('malformed_response')
        if refusal:
            self.invalid('refusal')
        if reason != 'stop':
            self.invalid('truncated' if reason == 'length' else 'incomplete_completion')
        if content is None or content == '':
            self.invalid('empty_content')
        if not isinstance(content, str):
            self.invalid('malformed_response')
        try:
            return self.schema.model_validate_json(content, strict=True)
        except ValidationError as exc:
            category = 'json_parsing' if any(e['type'] == 'json_invalid' for e in exc.errors(include_input=False, include_context=False, include_url=False)) else 'schema_validation'
            self.invalid(category, validation=exc)
        except ValueError:
            self.invalid('schema_validation')
