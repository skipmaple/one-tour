module AITools
  class Base < RubyLLM::Tool
    # Tools are constructed per chat turn with the tour/user already verified
    # at chat-start time (ChatStreamJob checks tour.editable_by?(user)). By
    # binding the tour to the instance we take the tour_id param away from the
    # LLM entirely — so it can neither hallucinate an id (qwen3.5 liked to
    # default to 1) nor intentionally target another user's tour.
    #
    # Day / Activity lookups scope through @tour.days / @tour.activities, so a
    # rogue day_id or activity_id for a different tour surfaces as "not found"
    # instead of editing someone else's data.
    attr_reader :tour, :user

    def initialize(tour: nil, user: nil)
      super()
      @tour = tour
      @user = user
    end

    protected
      def ok(data = {})
        { ok: true }.merge(data)
      end

      def bail(message, code: "generic_error")
        { ok: false, error: { code: code, message: message } }
      end

      # Subclasses call this at the top of `with_rescues do` when they need
      # the bound tour context. A separate method so tests can still
      # construct a tool with no tour and observe a structured error.
      def require_tour!
        bail("Tool has no tour context", code: "tour_context_missing") if @tour.nil?
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
