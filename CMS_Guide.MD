# CMS Guide

## Homepage Background

The homepage hero background is editable in Directus.

1. Open **Homepage Sections**.
2. Open or create the item with `section_key` set to `hero`.
3. Set **Image** to the desired background image.
4. Optional: edit **Heading** and **Subheading** for the hero text.
5. Make sure **Is Visible** is enabled.

If the `hero` item has no image, the site falls back to `public/images/theatre-hero.png`.

## Metin Bankası References From Oyunlarımız

To mark a text-bank play as already performed, edit the matching item in **Plays**:

1. Set **Text Bank Source** to `concord_theatricals` or `drama_online_library`.
2. Set **Text Bank Source ID** to the `source_id` from the text-bank record.
3. Optional: set **Text Bank Source URL** to the original Concord or Drama Online page.

Referenced text-bank records are filterable in **Metin Bankası** and display `★ Oynandı`.

## Blog References

Blog posts can link to staged plays and text-bank records.

For staged plays:

1. Open a **Blog Posts** item.
2. Use **Related Plays** to select one or more records from **Oyunlarımız**.

For text-bank records:

1. Open a **Blog Posts** item.
2. Add entries under **Text Bank References**.
3. Fill **Source**, **Source ID**, **Title**, and optionally **Source URL**.

Related blog posts appear on the matching play detail page and text-bank detail page.
