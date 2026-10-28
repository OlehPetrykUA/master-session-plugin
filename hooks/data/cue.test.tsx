import { expect, test } from 'claude-code/testing'

import { CREDENTIALS } from '../testing/credentials'
import { hasCue } from './describe'

const CUED_ROWS = new Set([...Array.from({ length: 48 }, (_, index) => index + 1), 52, 57, 64, 66, 72, 75, 81, 84, 85])

const FORTY = 'Ab12'.repeat(10)

const THIRTY_SIX = 'a1B2'.repeat(9)

const check = (quiet: string[], loud: string[]) => {
  expect(quiet.filter(hasCue)).toEqual([])
  expect(loud.filter(text => !hasCue(text))).toEqual([])
}

test('every credential row that was cued stays cued, rows 87 and 92 stay as on main', () => {
  for (const [row, command] of CREDENTIALS) if (CUED_ROWS.has(row)) expect([row, hasCue(command)]).toEqual([row, true])
  for (const [row, command] of CREDENTIALS) if (row === 87 || row === 92) expect([row, hasCue(command)]).toEqual([row, false])
})

test('login shapes stay cued', () => {
  check(
    [],
    ['helm registry login ghcr.io -u me -p hunter2', 'Run: helm registry login ghcr.io -u me -p hunter2', 'Run: oras login ghcr.io -u me -p hunter2', 'Run: acme login myreg -u me -p hunter2', 'Run: acme login localhost:5000 -u me -p hunter2', 'docker login -p hunter2x', 'cf login -p x', 'ls; mysql -p hunter2', 'mysql -u me -p hunter2', 'echo a && foo login -p hunter2x', 'sudo foo login -p hunter2x', 'x=$(foo login -p hunter2x)', 'run docker login -p hunter2x', 'Run: acme login -u me -p hunter2', 'Please run acme login -u me -p hunter2', 'Deploy steps:\nacme login -u me -p hunter2', 'FOO=1 acme login -p hunter2', 'env A=b acme login -p hunter2', 'sudo -E acme login -p hunter2', 'if ok; then acme login -p hunter2; fi', 'timeout 10 acme login -p hunter2', '{ acme login -p hunter2; }', '! acme login -p hunter2', 'xargs acme login -p hunter2', 'Run: acme login myreg extra -u me -p hunter2', 'Run: acme login "my reg" -p hunter2'],
  )
})

test('a bare login at the start cues', () => {
  check([], ['login -p hunter2', 'LOGIN -p hunter2', 'Login -u me -p hunter2'])
})

test('a weak word continued in camelCase cues', () => {
  check([], ['keyPrefix: s3cr3t', 'tokenValue=abc', 'secretName: x1', 'passWord: hunter2', 'credentialsFile = x1', 'authHeader: x1', 'pwHash=x1'])
})

test('user:password shapes stay cued', () => {
  check([], ['docker run -u 0:0 img && curl -u 1000:1234 x', 'docker pull x && curl -u 4711:12345678 https://api', 'docker pull x $(curl -u 4711:12345678 https://api)', 'curl --user me:pw', 'curl -u admin:hunter2', 'curl -u 1000:hunter2', 'curl --user 1000:1000x', 'curl -uadmin:hunter2', 'curl -u 4711:20240101 https://x', 'curl -u 1000:12345678 https://x', 'curl -u 0:0 https://x'])
})

test('camelCase key shapes stay cued', () => {
  check(
    [],
    ['cacheKey: s3cr3t', 'rowKey=hunter2', 'primaryKey: abc123', "sortKey: 'pa$$'", 'groupKey: abc def', 'sortKey: Hunter.Two', 'dbKey: x1', 'apiKey: x1', 'accessKey: x1', 'clientSecret: x1', 'authToken: x1', 'mySortKey: x1', 'sortToken: x1', 'sortAuth: x1', 'cacheKey: `Xk9wq2Lm`', 'sortKey: (s3cr3t)', 'sortKey: {"a": "Xk9wq2Lm"}'],
  )
})

test('key and dotted path shapes stay cued', () => {
  check(
    [],
    ['key: Hunter.ID', 'key: Secret.Name', 'KEY: Correct.Horse.Slug', 'key: a.b.KEY', 'key: x.id hunter2', 'key={item.id} hunter2', 'key: abc123', 'key=abc123', 'key: row.id9', 'key={item.id}x', 'key: a1.b2', 'key: row', 'key: {x}', 'key={`${a}`}', 'key: Hunter.two!', 'key: my.secret@123', 'key = Pass.word#1x', 'key: row.id-hunter2', 'key: correct.horse.battery.staple', 'Key: Secret.Value', 'key: row.id, hunter2'],
  )
})

test('C5: glued compiler and find flags do not cue, a glued password does', () => {
  check(
    ['find . -prune', 'find . -print', 'find . -print0', 'find . -printf x', 'find . -path x', 'find . -perm x', 'gcc -pthread x', 'mvn -pl app', 'gcc -pedantic x', 'gcc -pipe x'],
    ['-psecret', 'mysql -phunter2', '-pHunter2', 'x -pruned', 'x -pipeline', 'x -pla', 'x -print00', 'x -Pl', 'x -PIPE', 'mysql -pipe', 'mysql -perm', 'mysql -u root -pl'],
  )
})

test('C6: npm environment names do not cue, an npm token does', () => {
  check(['npm_package_version', 'npm_config_registry', 'npm_lifecycle_event', 'npm_package_version=1.2.3'], [`npm_${THIRTY_SIX}`, 'npm_abc', 'npm_package_versionx', 'npm_config_auth'])
})

test('C7: sk-learn does not cue, an sk- key does', () => {
  check(['pip install sk-learn', 'sk-learn.'], [`sk-proj-${FORTY}`, `sk-ant-api03-${FORTY}`, 'sk-abc', 'sk-learnX1', 'sk-learn-9f8e', 'sk-learn_abc123', 'sk-learn.abc123'])
})

test('C8: exact constant names do not cue, other key names and every assignment do', () => {
  check(
    ['KEY_PREFIX', 'KEY_PATTERN', 'KEY_SEPARATOR', 'PRIMARY_KEY', 'SORT_KEY', 'CACHE_KEY', 'GROUP_KEY', 'import { CACHE_KEY } from x'],
    ['PRIMARY_KEY=hunter2', 'CACHE_KEY: hunter2', 'SORT_KEY=hunter2x', 'KEY_PREFIX=', 'PRIMARY_KEY = id', 'const CACHE_KEY = id', 'STRIPE_KEY', 'AWS_SECRET_ACCESS_KEY=', 'API_TOKEN', 'MY_SORT_KEY=x1', 'fooKEY_PREFIX', 'xSORT_KEY=abc', 'KEY_PREFIXX', 'KEY_PREFIX_X', 'xPRIMARY_KEY=x1', 'primary_key: x1'],
  )
})

test('C9: -P is a port for mysql, mysqldump and mariadb and a password elsewhere', () => {
  check(
    ['mysql -P 3306', 'mysqldump -P 3307', 'mariadb -P 3306', 'mysql -h db -P 3306 shop', 'MYSQL -P 3306'],
    ['sqlcmd -P x1', 'zip -P x1', 'mosquitto_pub -P x1', 'mariadb -P hunter', 'mysql -P 3306 -p hunter2', 'mysql -P  hunter2', 'mysql -p 3306', 'mysql -P 3306x', 'MYSQL -P hunter'],
  )
})
