import { HaproxyParser } from '../../server/src/parser/parser';
import { ValidationProvider } from '../../server/src/validation/validator';
import { VersionRegistry } from '../../server/src/registry/versionRegistry';
import { DiagnosticSeverity } from '../__mocks__/vscode-languageserver';

const parser = new HaproxyParser();
const registry = new VersionRegistry();

function validate(text: string, version = '3.1') {
  const doc = parser.parse(text, 'test://validate');
  const validator = new ValidationProvider(registry, version);
  return validator.validate(doc);
}

describe('ValidationProvider', () => {
  describe('unknown directives', () => {
    it('reports error for completely unknown directive', () => {
      const diags = validate('backend web\n    notadirective foo\n');
      expect(diags).toHaveLength(1);
      expect(diags[0]?.severity).toBe(DiagnosticSeverity.Error);
      expect(diags[0]?.message).toMatch(/unknown directive/i);
    });

    it('passes for known directive in correct section', () => {
      const diags = validate('backend web\n    balance roundrobin\n');
      expect(diags).toHaveLength(0);
    });
  });

  describe('section validation', () => {
    it('reports error for directive used in wrong section', () => {
      // use_backend is valid in frontend, not backend
      const diags = validate('backend web\n    use_backend other\n');
      const sectionErrors = diags.filter((d) => d.message.includes('not valid in'));
      expect(sectionErrors.length).toBeGreaterThan(0);
    });

    it('allows directive in all its valid sections', () => {
      const configs = [
        'defaults\n    balance roundrobin\n',
        'backend web\n    balance roundrobin\n',
        'listen stats\n    balance roundrobin\n',
      ];
      for (const cfg of configs) {
        const diags = validate(cfg);
        const balanceDiags = diags.filter((d) => d.message.includes('balance'));
        expect(balanceDiags).toHaveLength(0);
      }
    });
  });

  describe('HAProxy 2.4 removed directives', () => {
    it('reports error for reqrep in 2.4 (removed)', () => {
      const diags = validate(
        'frontend http-in\n    mode http\n    reqrep ^Host:\\ (.*)\\.test Host:\\ \\1.prod\n',
        '2.4'
      );
      const reqrepErrors = diags.filter((d) => d.message.includes('reqrep'));
      expect(reqrepErrors.length).toBeGreaterThan(0);
      expect(reqrepErrors[0]?.severity).toBe(DiagnosticSeverity.Error);
    });

    it('reports error for rsprep in 2.4 (removed)', () => {
      const diags = validate('backend web\n    mode http\n    rsprep ^X-Powered-By:\\ .* X-Powered-By:\\ HAProxy\n', '2.4');
      const rsprepErrors = diags.filter((d) => d.message.includes('rsprep'));
      expect(rsprepErrors.length).toBeGreaterThan(0);
    });
  });

  describe('mode compatibility', () => {
    it('reports error for http-only directive in tcp mode section', () => {
      const text = [
        'frontend tcp-in',
        '    mode tcp',
        '    http-request set-header X-Test value',
      ].join('\n');
      const diags = validate(text);
      const modeErrors = diags.filter((d) => d.message.includes('HTTP mode'));
      expect(modeErrors.length).toBeGreaterThan(0);
    });

    it('allows http-request in http mode section', () => {
      const text = [
        'frontend http-in',
        '    mode http',
        '    http-request set-header X-Test value',
      ].join('\n');
      const diags = validate(text);
      const modeErrors = diags.filter((d) => d.message.includes('HTTP mode'));
      expect(modeErrors).toHaveLength(0);
    });
  });

  describe('parse errors surface as diagnostics', () => {
    it('surfaces parse error for directive outside section', () => {
      const diags = validate('daemon\n');
      expect(diags).toHaveLength(1);
      expect(diags[0]?.severity).toBe(DiagnosticSeverity.Error);
      expect(diags[0]?.message).toMatch(/outside of any section/);
    });
  });

  describe('max diagnostics cap', () => {
    it('returns at most 100 diagnostics', () => {
      const lines = ['backend web'];
      for (let i = 0; i < 200; i++) {
        lines.push(`    unknowndirective${i} value`);
      }
      const diags = validate(lines.join('\n'));
      expect(diags.length).toBeLessThanOrEqual(100);
    });
  });

  describe('version fallback', () => {
    it('falls back to nearest lower version for unknown version string', () => {
      // 3.5 is unknown — should resolve to 3.1 (nearest lower)
      const diags = validate('backend web\n    balance roundrobin\n', '3.5');
      expect(diags).toHaveLength(0);
    });
  });

  describe('action sub-keyword validation — http-request/response', () => {
    it('reports error for unknown http-request action', () => {
      const text = 'frontend http\n    http-request unknown-action\n';
      const diags = validate(text);
      const actionErrors = diags.filter((d) => d.message.includes('unknown-action'));
      expect(actionErrors).toHaveLength(1);
      expect(actionErrors[0]?.severity).toBe(DiagnosticSeverity.Error);
    });

    it('passes for valid http-request deny action', () => {
      const text = 'frontend http\n    http-request deny\n';
      const diags = validate(text);
      expect(diags.filter((d) => d.message.includes('deny'))).toHaveLength(0);
    });

    it('passes for valid http-request set-header action', () => {
      const text = 'frontend http\n    http-request set-header X-Test value\n';
      const diags = validate(text);
      expect(diags.filter((d) => d.message.includes('set-header'))).toHaveLength(0);
    });

    it('reports error for action not valid in http-response', () => {
      // auth is httpReq only
      const text = 'backend web\n    http-response auth\n';
      const diags = validate(text);
      expect(diags.some((d) => d.message.includes('auth') && d.message.includes('not a valid'))).toBe(true);
    });

    it('passes for valid http-response set-header action', () => {
      const text = 'backend web\n    http-response set-header X-Test value\n';
      const diags = validate(text);
      expect(diags.filter((d) => d.message.includes('set-header'))).toHaveLength(0);
    });

    it('reports error for unknown http-after-response action', () => {
      const text = 'backend web\n    http-after-response fake-action\n';
      const diags = validate(text);
      expect(diags.some((d) => d.message.includes('fake-action'))).toBe(true);
    });

    it('passes for valid http-after-response set-header action', () => {
      const text = 'backend web\n    http-after-response set-header X-Via proxy\n';
      const diags = validate(text);
      expect(diags.filter((d) => d.message.includes('set-header'))).toHaveLength(0);
    });

    it('handles parenthesised action names (set-var)', () => {
      // set-var(my_var) should be stripped to set-var for lookup
      const text = 'frontend http\n    http-request set-var(txn.user) req.cook(user)\n';
      const diags = validate(text);
      expect(diags.filter((d) => d.message.includes('set-var'))).toHaveLength(0);
    });
  });

  describe('action sub-keyword validation — tcp-request/response', () => {
    it('reports error for unknown tcp-request connection action', () => {
      const text = 'frontend tcp\n    tcp-request connection not-an-action\n';
      const diags = validate(text);
      expect(diags.some((d) => d.message.includes('not-an-action'))).toBe(true);
    });

    it('passes for valid tcp-request connection accept', () => {
      const text = 'frontend tcp\n    tcp-request connection accept\n';
      const diags = validate(text);
      expect(diags.filter((d) => d.message.includes('accept'))).toHaveLength(0);
    });

    it('passes for valid tcp-request connection reject', () => {
      const text = 'frontend tcp\n    tcp-request connection reject\n';
      const diags = validate(text);
      expect(diags.filter((d) => d.message.includes('reject'))).toHaveLength(0);
    });

    it('reports error for action not valid in tcp-request connection', () => {
      // set-header is httpReq only
      const text = 'frontend tcp\n    tcp-request connection set-header X-Test val\n';
      const diags = validate(text);
      expect(diags.some((d) => d.message.includes('set-header') && d.message.includes('not a valid'))).toBe(true);
    });

    it('passes for valid tcp-request content set-var', () => {
      const text = 'frontend tcp\n    tcp-request content set-var(txn.x) int(1)\n';
      const diags = validate(text);
      expect(diags.filter((d) => d.message.includes('set-var'))).toHaveLength(0);
    });

    it('passes for valid tcp-response content set-var', () => {
      const text = 'backend web\n    tcp-response content set-var(txn.y) int(2)\n';
      const diags = validate(text);
      expect(diags.filter((d) => d.message.includes('set-var'))).toHaveLength(0);
    });

    it('passes for tcp-request inspect-delay (no action to validate)', () => {
      const text = 'frontend tcp\n    tcp-request inspect-delay 5s\n';
      const diags = validate(text);
      expect(diags).toHaveLength(0);
    });
  });

  describe('compound directive resolution', () => {
    it('resolves option httplog as a known directive', () => {
      const text = 'frontend http\n    option httplog\n';
      const diags = validate(text);
      expect(diags.filter((d) => d.message.includes('Unknown directive'))).toHaveLength(0);
    });

    it('reports error for unknown option variant', () => {
      const text = 'backend web\n    option not-a-real-option\n';
      const diags = validate(text);
      expect(diags.some((d) => d.message.includes('Unknown directive'))).toBe(true);
    });

    it('resolves tcp-request connection as a known directive', () => {
      const text = 'frontend tcp\n    tcp-request connection accept\n';
      const diags = validate(text);
      expect(diags.filter((d) => d.message.includes('Unknown directive'))).toHaveLength(0);
    });
  });
});
