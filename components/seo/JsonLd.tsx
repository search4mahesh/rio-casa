/**
 * Emit a schema.org graph as a `<script type="application/ld+json">`.
 *
 * A server component with no interactivity, so the JSON is in the HTML that
 * crawlers receive rather than something a renderer has to execute to find.
 *
 * `JSON.stringify` output is escaped for `<` before it goes into the tag: the
 * payload includes room descriptions and amenity names that come from the
 * database, and a stray `</script>` in one of those would close the tag early
 * and spill the rest of the graph into the page as markup.
 */
export default function JsonLd({ data }: { data: object | object[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      // The content is our own serialised object, not user-supplied markup,
      // and the escape above closes the one way it could become markup.
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
