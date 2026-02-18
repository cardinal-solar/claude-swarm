#!/bin/bash
set -e

ARGS="--print --output-format json --no-session-persistence"

if [ -n "$TASK_SCHEMA" ]; then
  ARGS="$ARGS --json-schema '$TASK_SCHEMA'"
fi

if [ -n "$CLAUDE_MODEL" ]; then
  ARGS="$ARGS --model $CLAUDE_MODEL"
fi

if [ -n "$TASK_TIMEOUT" ]; then
  TIMEOUT_FLAG="timeout ${TASK_TIMEOUT}s"
fi

RESULT=$(eval $TIMEOUT_FLAG claude $ARGS "$TASK_PROMPT" 2>/tmp/stderr.log) || {
  echo "Claude execution failed" >&2
  cat /tmp/stderr.log >&2
  exit 1
}

echo "$RESULT" > /workspace/result.json
