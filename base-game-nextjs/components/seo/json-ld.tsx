type JsonLdData = Record<string, unknown> | Array<Record<string, unknown>>

function serializeJsonLd(data: JsonLdData) {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}

export function JsonLd({ data }: { data: JsonLdData }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
