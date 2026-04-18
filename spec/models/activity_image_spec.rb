require "rails_helper"

RSpec.describe ActivityImage do
  let(:tour)     { create(:tour) }
  let(:day)      { tour.days.first }
  let(:activity) { create(:activity, tour: tour, day: day) }
  let(:user)     { tour.author }

  def build_image(**attrs)
    image = described_class.new(activity: activity, uploaded_by: user, **attrs)
    image.file.attach(io: StringIO.new("fake-image-bytes"), filename: "p.jpg", content_type: "image/jpeg")
    image
  end

  it "is valid with activity, uploader, and attached file" do
    expect(build_image).to be_valid
  end

  it "requires a file attachment" do
    image = described_class.new(activity: activity, uploaded_by: user)
    expect(image).not_to be_valid
    expect(image.errors[:file]).to include("请选择一张图片")
  end

  it "rejects non-image content types" do
    image = described_class.new(activity: activity, uploaded_by: user)
    image.file.attach(io: StringIO.new("fake"), filename: "p.pdf", content_type: "application/pdf")
    expect(image).not_to be_valid
    expect(image.errors[:file].first).to match(/不支持的格式/)
  end

  it "rejects files over 10 MB" do
    image = build_image
    allow(image.file.blob).to receive(:byte_size).and_return(11.megabytes)
    expect(image).not_to be_valid
    expect(image.errors[:file]).to include("大小超过 10 MB")
  end

  it "caps caption at 280 chars" do
    image = build_image(caption: "x" * 281)
    expect(image).not_to be_valid
  end

  it "caps images per activity at 20" do
    20.times { build_image.save! }
    expect(build_image).not_to be_valid
  end

  describe "#mark_as_cover!" do
    it "sets is_cover true and unsets the previous cover" do
      first = build_image; first.save!; first.update!(is_cover: true)
      second = build_image; second.save!
      expect { second.mark_as_cover! }.to change { first.reload.is_cover }.from(true).to(false)
      expect(second.reload.is_cover).to be true
    end

    it "is idempotent when the image is already cover" do
      image = build_image; image.save!; image.update!(is_cover: true)
      expect { image.mark_as_cover! }.not_to raise_error
      expect(image.reload.is_cover).to be true
    end
  end

  describe "partial unique index" do
    it "only allows one cover per activity at DB level" do
      first = build_image; first.save!; first.update!(is_cover: true)
      second = build_image; second.save!
      expect {
        second.update_columns(is_cover: true)  # bypass callbacks to test index
      }.to raise_error(ActiveRecord::RecordNotUnique)
    end
  end
end
