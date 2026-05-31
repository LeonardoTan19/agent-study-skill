#!/usr/bin/env bash
set -eu

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
recognize() { npx tsx "$PROJECT_ROOT/skills/speech-recognize/scripts/recognize.ts" "$@"; }
to_markdown() { npx tsx "$PROJECT_ROOT/skills/speech-recognize/scripts/to-markdown.ts" "$@"; }

say() { printf "${1}%s${NC}\n" "$2"; }
pass() { say "$GREEN" "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { say "$RED" "  FAIL: $1"; FAIL=$((FAIL + 1)); }

check_prereqs() {
  say "$YELLOW" "=== Prerequisites ==="
  node -e 'process.exit(parseInt(process.version.slice(1)) >= 18 ? 0 : 1)' && pass "Node.js >= 18" || fail "Node.js >= 18"
  npx --version >/dev/null 2>&1 && pass "npx available" || fail "npx available"
}

test_recognize_errors() {
  say "$YELLOW" "=== recognize.ts error paths ==="

  # No args
  if recognize 2>&1 | grep -q "Usage:"; then
    pass "no args → usage"
  else
    fail "no args → usage"
  fi

  # Missing credentials
  if recognize --filePath /tmp/fake.mp3 2>&1 | grep -q "appId and accessToken required"; then
    pass "no creds → error message"
  else
    fail "no creds → error message"
  fi

  # Missing file (needs creds to reach file-read code)
  if BYTEDANCE_APP_ID=x BYTEDANCE_ACCESS_TOKEN=x recognize --filePath /tmp/nonexistent.mp3 2>&1 | grep -q "ENOENT"; then
    pass "missing file → ENOENT"
  else
    fail "missing file → ENOENT"
  fi
}

test_recognize_api_path() {
  say "$YELLOW" "=== recognize.ts API path (fake creds) ==="

  echo "test" > "$TMPDIR/fake-audio.mp3"

  # Should reach the API and get auth error (not a script crash)
  if BYTEDANCE_APP_ID=fake BYTEDANCE_ACCESS_TOKEN=fake recognize --filePath "$TMPDIR/fake-audio.mp3" 2>&1 | grep -q "X-Api-Status-Code"; then
    pass "API call sent, auth rejected as expected"
  else
    fail "API call sent, auth rejected as expected"
  fi

  # --fileUrl path (no network needed — fails at credential check like filePath)
  if recognize --fileUrl https://example.com/audio.mp3 2>&1 | grep -q "appId and accessToken required"; then
    pass "fileUrl without creds → error message"
  else
    fail "fileUrl without creds → error message"
  fi
}

test_to_markdown() {
  say "$YELLOW" "=== to-markdown.ts ==="

  # Missing input
  if to_markdown 2>&1 | grep -q "result.json not found"; then
    pass "no input → error message"
  else
    fail "no input → error message"
  fi

  # Empty result
  echo '{"result":[]}' > "$TMPDIR/empty.json"
  if to_markdown --input "$TMPDIR/empty.json" 2>&1 | grep -q "no result"; then
    pass "empty result → error message"
  else
    fail "empty result → error message"
  fi

  # Valid input with utterances
  cat > "$TMPDIR/with-utt.json" << 'EOF'
{
  "result": [{
    "text": "大家好。",
    "utterances": [{
      "text": "大家好。",
      "start_time": 0,
      "end_time": 1500,
      "definite": true,
      "words": [{"text":"大家","start_time":0,"end_time":700,"blank_duration":0},{"text":"好。","start_time":700,"end_time":1500,"blank_duration":0}]
    }]
  }],
  "audio_info": {"duration": 1500}
}
EOF
  to_markdown --input "$TMPDIR/with-utt.json" --output "$TMPDIR/with-utt.md" >/dev/null 2>&1
  if grep -q "完整文本" "$TMPDIR/with-utt.md" && grep -q "时间线" "$TMPDIR/with-utt.md"; then
    pass "valid input → markdown with timeline + full text"
  else
    fail "valid input → markdown with timeline + full text"
  fi

  # Valid input without utterances
  cat > "$TMPDIR/textonly.json" << 'EOF'
{"result":[{"text":"纯文本结果。"}],"audio_info":{"duration":1000}}
EOF
  to_markdown --input "$TMPDIR/textonly.json" --output "$TMPDIR/textonly.md" >/dev/null 2>&1
  if grep -q "转写文本" "$TMPDIR/textonly.md"; then
    pass "text-only input → markdown with text section"
  else
    fail "text-only input → markdown with text section"
  fi
}

main() {
  echo ""
  say "$YELLOW" "=== speech-recognize smoke test ==="
  echo ""

  check_prereqs
  test_recognize_errors
  test_recognize_api_path
  test_to_markdown

  echo ""
  echo "----------------------------------------"
  printf "Results: ${GREEN}%d passed${NC}, ${RED}%d failed${NC}\n" $PASS $FAIL
  echo "----------------------------------------"

  [ $FAIL -eq 0 ] || exit 1
}

main
