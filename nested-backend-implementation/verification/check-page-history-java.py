"""Compile the snippets using locally cached Maven jars, then run offline checks.
No downloads. The isolated compile fixture supplies the pre-existing omitted
entity package/import and ResourceNotFoundException, without changing production files.
Run from workspace root: python nested-backend-implementation/verification/check-page-history-java.py
"""
from pathlib import Path
import os
import re
import subprocess
import sys

root = Path.cwd()
backend = root / 'nested-backend-implementation'
cache = Path.home() / '.m2/repository'
output = root / 'node_modules/.tmp/page-history-java'
output.mkdir(parents=True, exist_ok=True)
artifacts = [
    'spring-core', 'spring-beans', 'spring-context', 'spring-expression', 'spring-aop',
    'spring-web', 'spring-jdbc', 'spring-tx', 'spring-data-commons', 'spring-data-jpa',
    'spring-security-core', 'jakarta.persistence-api', 'jakarta.servlet-api', 'lombok',
    'jspecify', 'commons-logging', 'postgresql',
]
jars = []
for artifact in artifacts:
    candidates = [p for p in cache.rglob(f'{artifact}-*.jar')
                  if p.name == f'{artifact}-{p.parent.name}.jar']
    if not candidates:
        raise SystemExit(f'Missing cached dependency: {artifact}. Run checks in the integrated application instead.')
    jars.append(max(candidates, key=lambda p: tuple(int(n) for n in re.findall(r'\d+', p.parent.name))))
classpath = os.pathsep.join(str(p) for p in jars)
entity = output / 'UserPageHistory.java'
entity.write_text('package com.bistech.reporting.model.audit;\nimport com.bistech.reporting.model.user.User;\n'
                  + (backend / 'model/UserPageHistory.java').read_text(), encoding='utf-8')
exception = output / 'ResourceNotFoundException.java'
exception.write_text('package com.bistech.reporting.exception; public class ResourceNotFoundException extends RuntimeException {'
                     'public ResourceNotFoundException(String message) { super(message); }}', encoding='utf-8')
files = [
    'model/user/User.java', 'repository/user/UserRepository.java',
    'repository/UserPageHistoryRepository.java', 'repository/UserPageHistorySpecs.java',
    'repository/PageHistoryReadRepository.java', 'service/AnalyticsService.java',
    'controller/AnalyticsController.java', 'dto/PageResponse.java',
    'verification/PageHistoryCheck.java',
    'verification/PageHistoryDatabaseCheck.java',
]
sources = [str(backend / f) for f in files] + [str(f) for f in (backend / 'dto/audit').glob('*.java')] + [str(entity), str(exception)]
compiled = subprocess.run(['javac', '-encoding', 'UTF-8', '-parameters', '-cp', classpath, '-d', str(output), *sources],
                          capture_output=True, text=True)
print(compiled.stdout, end='')
print(compiled.stderr, end='', file=sys.stderr)
compiled.check_returncode()
# Some JDK versions report a jar-close failure yet return exit status zero.
if 'An exception has occurred in the compiler' in compiled.stderr:
    raise SystemExit('Compiler reported an internal/access failure; verification is incomplete.')
subprocess.run(['java', '-cp', str(output) + os.pathsep + classpath, 'PageHistoryCheck'], check=True)
print('Compiled analytics backend against cached dependencies with documented snippet-only fixture adapters.')
if '--database' in sys.argv:
    subprocess.run(['java', '-cp', str(output) + os.pathsep + classpath, 'PageHistoryDatabaseCheck'], check=True)
