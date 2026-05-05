// A tiny, hardcoded text library so the room renders meaningful content
// without needing live Sefaria/Gutenberg integrations. The spec's full text
// pipeline lives in Phase 2+.

export type TextEntry = {
  title: string;
  author?: string;
  source: "Public domain" | "Demo";
  passages: { label: string; html: string }[];
};

const FALLBACK: TextEntry = {
  title: "Marginalia",
  source: "Demo",
  passages: [
    {
      label: "A note from the maintainer",
      html: `<p>This sample room is using a demo passage because no PDF was attached to the pairing.</p>
<p>For a real pairing, upload a private PDF or import a web page that links to a PDF when you enter the queue. The room will render that PDF beside the shared notebook.</p>`,
    },
  ],
};

const LIBRARY: Record<string, TextEntry> = {
  "meditations — marcus aurelius": {
    title: "Meditations",
    author: "Marcus Aurelius",
    source: "Public domain",
    passages: [
      {
        label: "Book II · 1",
        html: `<p>Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful, arrogant, deceitful, envious, unsocial. All these things happen to them by reason of their ignorance of what is good and evil.</p>
<p>But I who have seen the nature of the good, that it is beautiful, and of the bad, that it is ugly, and the nature of him who does wrong, that it is akin to me, not only of the same blood or seed, but that it participates in the same intelligence and the same portion of the divinity, I can neither be injured by any of them, for no one can fix on me what is ugly, nor can I be angry with my kinsman, nor hate him.</p>
<p>For we are made for co-operation, like feet, like hands, like eyelids, like the rows of the upper and lower teeth. To act against one another then is contrary to nature; and it is acting against one another to be vexed and to turn away.</p>`,
      },
      {
        label: "Book IV · 3",
        html: `<p>Men seek retreats for themselves, houses in the country, sea-shores, and mountains; and thou too art wont to desire such things very much. But this is altogether a mark of the most common sort of men, for it is in thy power whenever thou shalt choose to retire into thyself.</p>
<p>For nowhere either with more quiet or more freedom from trouble does a man retire than into his own soul, particularly when he has within him such thoughts that by looking into them he is immediately in perfect tranquility.</p>`,
      },
    ],
  },
  "the brothers karamazov": {
    title: "The Brothers Karamazov",
    author: "Fyodor Dostoevsky",
    source: "Public domain",
    passages: [
      {
        label: "Book V · Chapter 4 · Rebellion",
        html: `<p>"I must make you one confession," Ivan began. "I could never understand how one can love one's neighbours. It's just one's neighbours, to my mind, that one can't love, though one might love those at a distance."</p>
<p>"For anyone to love a man, he must be hidden, for as soon as he shows his face, love is gone."</p>
<p>"I want to forgive. I want to embrace. I don't want more suffering. And if the sufferings of children go to swell the sum of sufferings which was necessary to pay for truth, then I protest that the truth is not worth such a price."</p>`,
      },
    ],
  },
  "genealogy of morals": {
    title: "On the Genealogy of Morals",
    author: "Friedrich Nietzsche",
    source: "Public domain",
    passages: [
      {
        label: "First Essay · 10",
        html: `<p>The slave revolt in morality begins when ressentiment itself becomes creative and gives birth to values: the ressentiment of beings who, denied the proper response of action, compensate for it only with imaginary revenge.</p>
<p>While all noble morality grows out of a triumphant Yes-saying to oneself, slave morality from the start says No to an "outside," to an "other," to a "non-self": and this No is its creative deed.</p>`,
      },
    ],
  },
};

export function findText(title: string): TextEntry {
  const k = title.trim().toLowerCase();
  if (LIBRARY[k]) return LIBRARY[k];
  // fuzzy contains
  for (const [key, entry] of Object.entries(LIBRARY)) {
    if (k.includes(key) || key.includes(k)) return entry;
  }
  return { ...FALLBACK, title };
}
