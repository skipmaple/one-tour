require "rails_helper"

RSpec.describe FrontmatterParser do
  describe "#parse" do
    it "extracts frontmatter and body from valid content" do
      content = <<~MD
        ---
        title: Test Trip
        days:
          - day: 1
            title: Day One
            coordinates: [43.83, 87.62]
        ---

        # Hello World
      MD

      result = FrontmatterParser.new(content).parse

      expect(result.frontmatter["title"]).to eq "Test Trip"
      expect(result.frontmatter["days"].length).to eq 1
      expect(result.body).to include "# Hello World"
      expect(result.valid?).to be true
      expect(result.errors).to be_empty
    end

    it "returns errors for invalid YAML" do
      content = "---\ntitle: [invalid yaml\n---\n\n# Body"

      result = FrontmatterParser.new(content).parse

      expect(result.valid?).to be false
      expect(result.errors).to include(match(/YAML/i))
      expect(result.body).to include "# Body"
    end

    it "returns errors when title is missing" do
      content = "---\ndays: []\n---\n\n# Body"

      result = FrontmatterParser.new(content).parse

      expect(result.valid?).to be false
      expect(result.errors).to include(match(/title/i))
    end

    it "handles content with no frontmatter" do
      content = "# Just a markdown file"

      result = FrontmatterParser.new(content).parse

      expect(result.frontmatter).to eq({})
      expect(result.body).to eq content
      expect(result.valid?).to be false
    end
  end

  describe "#publishable?" do
    it "returns true when title and days with coordinates exist" do
      content = <<~MD
        ---
        title: Trip
        days:
          - day: 1
            title: Day One
            coordinates: [43.83, 87.62]
        ---

        # Content
      MD

      result = FrontmatterParser.new(content).parse
      expect(result.publishable?).to be true
    end

    it "returns false when days have no coordinates" do
      content = <<~MD
        ---
        title: Trip
        days:
          - day: 1
            title: Day One
        ---

        # Content
      MD

      result = FrontmatterParser.new(content).parse
      expect(result.publishable?).to be false
    end

    it "returns false when days is empty" do
      content = "---\ntitle: Trip\ndays: []\n---\n\n# Content"

      result = FrontmatterParser.new(content).parse
      expect(result.publishable?).to be false
    end
  end

  describe "warnings" do
    it "returns empty warnings for valid content" do
      content = <<~MD
        ---
        title: Test Trip
        days:
          - day: 1
            title: Day One
            coordinates: [43.83, 87.62]
        ---

        # Hello
      MD

      result = FrontmatterParser.new(content).parse
      expect(result.warnings).to be_empty
    end

    it "warns about out-of-range latitude in day coordinates" do
      content = <<~MD
        ---
        title: Test
        days:
          - day: 1
            title: Day One
            coordinates: [200, 87.62]
        ---
      MD

      result = FrontmatterParser.new(content).parse
      expect(result.warnings).to include(match(/latitude.*out of range/i))
    end

    it "warns about out-of-range longitude in day coordinates" do
      content = <<~MD
        ---
        title: Test
        days:
          - day: 1
            title: Day One
            coordinates: [43.83, 200]
        ---
      MD

      result = FrontmatterParser.new(content).parse
      expect(result.warnings).to include(match(/longitude.*out of range/i))
    end

    it "warns about duplicate day numbers" do
      content = <<~MD
        ---
        title: Test
        days:
          - day: 1
            title: Day One
            coordinates: [43.83, 87.62]
          - day: 1
            title: Day One Again
            coordinates: [44.0, 88.0]
        ---
      MD

      result = FrontmatterParser.new(content).parse
      expect(result.warnings).to include(match(/duplicate day numbers/i))
    end

    it "warns about non-sequential day numbers" do
      content = <<~MD
        ---
        title: Test
        days:
          - day: 1
            title: Day One
            coordinates: [43.83, 87.62]
          - day: 3
            title: Day Three
            coordinates: [44.0, 88.0]
        ---
      MD

      result = FrontmatterParser.new(content).parse
      expect(result.warnings).to include(match(/non-sequential.*missing: 2/i))
    end

    it "warns about invalid intensity value" do
      content = <<~MD
        ---
        title: Test
        days:
          - day: 1
            title: Day One
            coordinates: [43.83, 87.62]
            intensity: extreme
        ---
      MD

      result = FrontmatterParser.new(content).parse
      expect(result.warnings).to include(match(/intensity.*extreme.*should be one of/i))
    end

    it "warns about point with out-of-range coordinates" do
      content = <<~MD
        ---
        title: Test
        days:
          - day: 1
            title: Day One
            coordinates: [43.83, 87.62]
            points:
              - name: Bad Point
                lat: 999
                lng: 87.62
        ---
      MD

      result = FrontmatterParser.new(content).parse
      expect(result.warnings).to include(match(/points\[0\].*latitude.*out of range/i))
    end

    it "warns about orphaned point_details" do
      content = <<~MD
        ---
        title: Test
        days:
          - day: 1
            title: Day One
            coordinates: [43.83, 87.62]
            points:
              - name: Place A
                lat: 43.83
                lng: 87.62
        point_details:
          "Place B":
            desc: "Orphaned detail"
        ---
      MD

      result = FrontmatterParser.new(content).parse
      expect(result.warnings).to include(match(/point_details\['Place B'\].*not referenced/))
    end

    it "does not produce warnings for empty frontmatter" do
      content = "# Just markdown"

      result = FrontmatterParser.new(content).parse
      expect(result.warnings).to be_empty
    end
  end
end
