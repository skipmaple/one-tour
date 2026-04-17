# Declare AITools as a top-level module and register app/ai_tools as its
# Zeitwerk namespace root.  Files directly under app/ai_tools/ map to
# AITools::* without any extra directory nesting.
module AITools
end

Rails.autoloaders.main.push_dir(
  Rails.root.join("app/ai_tools"),
  namespace: AITools
)
