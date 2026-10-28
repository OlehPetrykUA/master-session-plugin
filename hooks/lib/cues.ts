const WEAK = 'pass|pw|tokens?|secrets?|auth|authorization|credentials?|key'

const ENV = 'PASS|PW|TOKEN|SECRET|KEY|AUTH'

const CUES = [
  /password|passwd|passphrase|pwd|apikey|api[ _-]key|private[ _-]key|access[ _-]key|bearer|identified\s+by/i,
  new RegExp(`(?<![a-z0-9])(?:${WEAK})["']?\\s*[:=]\\s*\\S`, 'i'),
  /[a-z](?:Pass|Pw|Tokens?|Secrets?|Auth|Key|Credentials?)["']?\s*[:=]\s*\S/,
  /(?<![A-Za-z0-9])(?:pass|pw|tokens?|secrets?|auth|key|credentials?)[A-Z][A-Za-z0-9]*["']?\s*[:=]\s*\S/,
  new RegExp(`[A-Z0-9_]*(?:${ENV})[A-Z0-9_]*=`),
  new RegExp(`(?<![A-Z0-9_])(?:[A-Z0-9]+_(?:${ENV})|(?:${ENV})_[A-Z0-9_]+)(?![A-Z0-9_])`),
  new RegExp(`(?<![a-z0-9-])--(?:${WEAK})(?![a-z0-9])`, 'i'),
  /(?<![A-Za-z0-9])(?:gh[pousr]_|github_pat_|glpat-|xox[abpr]-|sk-|AKIA|ASIA|hvs\.|npm_)[A-Za-z0-9]/,
  /(?:^|[\s"'])-p[a-z0-9]/i,
  /\b(?:mysql|mysqladmin|mysqldump|mariadb|sshpass|sqlcmd|mongosh?|ssh-keygen|zip|unzip|mosquitto_pub|(?<![\w-])login)\b[^\n]*?\s-p\s+\S/i,
  /\bredis-cli\b[^\n]*?\s-a\s+\S/,
  /(?:^|\s)(?:-u\s*|--user[=\s]\s*)[^\s:]+:\S/,
  /\bldap\w*\b[^\n]*?\s-w\s+\S/i,
  /-U\s+[^\s%]+%\S/,
  /:\/\/[^\s/@]+@/,
  /hooks\.slack\.com\/services\//i,
  /\bgh\s+secret\b|\bvault\s+login\s+\S/i,
  /\|\s*sudo\s+-S\b|\bsudo\s+-S\s*<<</,
]

export const hasCue = (text: string) => CUES.some(cue => cue.test(text))
