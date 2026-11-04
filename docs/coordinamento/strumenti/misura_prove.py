# Misura del tempo in prove di o2/o3 (D-164). Uso: python -I misura_prove.py <trascrizioni .jsonl delle sessioni>; cambiare DAY.
# Nota: "vitest_mirato" include anche "tests/server" e "src" (giri completi): distinguerli guardando gli argomenti.
import sys, json, re
from datetime import datetime

DAY = '2026-10-09'


def ts(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


def classify(cmd):
    c = cmd.replace('\\\n', ' ')
    kinds = []
    if re.search(r'\b(vitest|yarn (run )?test|npm (run )?test|npx vitest|node_modules/vitest|vitest\.mjs)\b', c) and 'test:watch' not in c:
        # args after "vitest run" / "test" that look like paths or filters
        m = re.search(r'(?:vitest(?:\.mjs)?(?: run)?|yarn (?:run )?test|npm (?:run )?test)\s+([^|;&>]*)', c)
        args = (m.group(1) if m else '').strip()
        toks = [t for t in args.split() if not t.startswith('-') and t not in ('run',)]
        flags = [t for t in args.split() if t.startswith('-')]
        if toks or any(f.startswith('-t') or f.startswith('--testNamePattern') for f in flags):
            kinds.append('vitest_mirato')
        else:
            kinds.append('vitest_completo')
    if re.search(r'\btsc\b', c):
        kinds.append('tsc')
    if re.search(r'next(/dist/bin/next)? lint|\blint\b', c) and 'eslint-disable' not in c:
        kinds.append('lint')
    if re.search(r'next(/dist/bin/next)? build|yarn build|npm run build', c):
        kinds.append('build')
    if re.search(r'\bpytest\b', c):
        kinds.append('pytest')
    return kinds


for path in sys.argv[1:]:
    uses = {}
    results = {}
    for line in open(path, encoding='utf-8', errors='replace'):
        try:
            r = json.loads(line)
        except Exception:
            continue
        t = r.get('timestamp')
        if not t or not t.startswith(DAY):
            continue
        msg = r.get('message') or {}
        content = msg.get('content')
        if not isinstance(content, list):
            continue
        for b in content:
            if not isinstance(b, dict):
                continue
            if b.get('type') == 'tool_use' and b.get('name') in ('Bash', 'PowerShell'):
                inp = b.get('input') or {}
                uses[b['id']] = (t, inp.get('command', ''), bool(inp.get('run_in_background')))
            elif b.get('type') == 'tool_result':
                results[b.get('tool_use_id')] = t
    tot = {}
    n = {}
    bg = {}
    first = last = None
    for k, (t, cmd, isbg) in uses.items():
        kinds = classify(cmd)
        if not kinds:
            continue
        end = results.get(k)
        dur = (ts(end) - ts(t)).total_seconds() if end else 0
        key = '+'.join(kinds)
        n[key] = n.get(key, 0) + 1
        tot[key] = tot.get(key, 0) + dur
        if isbg:
            bg[key] = bg.get(key, 0) + 1
        first = min(first or t, t)
        last = max(last or t, t)
    print('==', path.split('/')[-1][:8], 'comandi Bash oggi:', len(uses), 'primo/ultimo comando di prova:', (first or '')[11:16], (last or '')[11:16])
    for key in sorted(n, key=lambda x: -tot[x]):
        print(f'  {key:40s} volte={n[key]:3d}  minuti={tot[key]/60:6.1f}  in_background={bg.get(key,0)}')
    print('  TOTALE minuti in prove:', round(sum(tot.values()) / 60, 1), ' su volte:', sum(n.values()))
