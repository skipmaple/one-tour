module AITools
  class Base < RubyLLM::Tool
    # Subclasses implement `execute(**kwargs)` and return a hash that will be
    # serialized back to the LLM. Use `ok(data)` for success and
    # `bail(message, code:)` for known errors (name is `bail` not `fail` to
    # avoid shadowing `Kernel#fail`).
    #
    # Wrap the actual DB/work in `with_rescues { ... }` to translate
    # unexpected AR/Ruby errors into structured LLM-friendly responses
    # instead of letting exceptions bubble up and abort the tool-call loop.

    protected
      def ok(data = {})
        { ok: true }.merge(data)
      end

      def bail(message, code: "generic_error")
        { ok: false, error: { code: code, message: message } }
      end

      def with_rescues
        yield
      rescue ActiveRecord::RecordInvalid => e
        bail(e.message, code: "validation")
      rescue ActiveRecord::RecordNotFound => e
        bail(e.message, code: "not_found")
      rescue ArgumentError => e
        bail(e.message, code: "invalid_argument")
      end
  end
end
