module AITools
  class Base < RubyLLM::Tool
    # Subclasses implement execute(**kwargs) and return a hash that will be
    # serialized back to the LLM. Use `ok(data)` for success and
    # `fail(message, code:)` for known errors.
  
    protected
      def ok(data = {})
        { ok: true }.merge(data)
      end
  
      def fail(message, code: "generic_error")
        { ok: false, error: { code: code, message: message } }
      end
  end
end
