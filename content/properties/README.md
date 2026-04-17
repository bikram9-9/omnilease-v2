# Property Context Files

Each property's long-form context lives in Markdown under:

`content/properties/<property-slug>/`

Recommended files:

- `overview.md`
- `amenities.md`
- `policies.md`
- `faqs.md`
- `touring.md`

The app loads whichever of these files exist and combines them with relational
unit data from the database when building the model prompt.
