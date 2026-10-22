# Readable live view of `claude --output-format stream-json` (one event per input line).
# Input is untrusted model output: lines are truncated, and the caller disables workflow commands.
def short($n): tostring | gsub("\\s+"; " ") | if length > $n then .[0:$n] + "…" else . end;

fromjson?
| if .type == "system" and .subtype == "init" then "▶ started: model \(.model)"
  elif .type == "assistant" then
    .message.content[]?
    | if .type == "text" then "💬 \(.text | short(400))"
      elif .type == "tool_use" then "🔧 \(.name) \((.input.file_path // .input.command // ((.input.pattern // empty) + (if .input.path then " in " + .input.path else "" end)) // .input.path // .input) | short(200))"
      else empty end
  elif .type == "user" then
    .message.content[]? | select(.type? == "tool_result" and .is_error == true) | "⚠️ tool error: \(.content | short(200))"
  elif .type == "result" then
    "■ finished: \(.subtype) is_error=\(.is_error) turns=\(.num_turns) cost=$\(.total_cost_usd)",
    (select(.is_error == true) | "   \(.result | short(2000))")
  else empty end
