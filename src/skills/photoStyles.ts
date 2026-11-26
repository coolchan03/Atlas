/**
 * Photo and picture styles, described in detail. One list feeds the "photo-styles" skill (as its reference file, so only the
 * styles a request is about reach a small model) and the looks in the Photo studio (the short keyword line goes to the image
 * model, which reads a few dozen words, not paragraphs). Traits and techniques only: no artist names.
 */

export interface PhotoStyle {
  id: string;
  label: string;
  /** One sentence: what it is. */
  summary: string;
  /** Lines, shapes and level of detail. */
  look: string;
  colour: string;
  light: string;
  texture: string;
  composition: string;
  mood: string;
  /** What it suits. */
  fits: string;
  /** A ready line for an image model: short, comma separated. */
  keywords: string;
  /** What to leave out of a prompt, or what makes it drift into another style. */
  avoid: string;
}

export const PHOTO_STYLES: PhotoStyle[] = [
  {
    id: 'realistic', label: 'Realistic photograph',
    summary: 'A picture that looks like it came from a camera: real materials, believable light, natural proportions.',
    look: 'Sharp focus on the subject with a soft, gradual blur behind it. Edges are not outlined; shapes are made by light and shadow. Skin, fabric, metal and wood each show their own fine detail. Perspective follows a real lens.',
    colour: 'Natural colours with small differences in each surface. Skin tones stay warm and uneven, whites are slightly tinted by the light, and shadows hold a little colour instead of pure black.',
    light: 'One clear light source: window light, overcast sky, low golden sun or a flash. Shadows have soft edges that match the source. Reflections and highlights sit where that light would put them.',
    texture: 'Fine grain or none. Pores, fibres, scratches, dust and wet shine are visible up close.',
    composition: 'Eye-level or slightly low or high, as a person holding a camera would stand. A subject placed off centre, space to look into, a foreground, middle and background.',
    mood: 'Calm and believable. It can be warm, cold, quiet or busy depending on the light and the scene.',
    fits: 'Portraits, places, food, products, nature, anything that should look like a real moment.',
    keywords: 'realistic photograph, natural light, sharp focus, shallow depth of field, fine detail, true to life colours, 50mm lens',
    avoid: 'Words like painting, illustration or cartoon. Too many adjectives about beauty, which push it toward a glossy, plastic look. Say what is in the scene and where the light comes from instead.',
  },
  {
    id: 'cinematic', label: 'Cinematic film still',
    summary: 'A frame that looks taken from a feature film: staged, lit with intent, and framed wide.',
    look: 'Wide frame, often twice as wide as tall. A shallow blur isolates the subject. Fine detail on faces and props, with a slight softness at the edges of the frame.',
    colour: 'A limited, planned palette, often a warm tone against a cool one (orange skin against teal shadows). Colours are a little muted and contrast is firm.',
    light: 'Directional and dramatic: a strong key light from the side or behind, a rim of light on the edge of the subject, deep shadows, haze or dust catching beams.',
    texture: 'Fine film grain, a soft glow around bright lights, slight lens flare.',
    composition: 'Subject on a third, strong leading lines, depth in layers, a lot of space around the figure, low or high camera angles that add weight.',
    mood: 'Tense, quiet, epic or tender. It feels like one moment in a longer story.',
    fits: 'Scenes with a story: a lone figure, a street at night, a meeting, a chase, a landscape with a person in it.',
    keywords: 'cinematic film still, wide shot, dramatic lighting, rim light, shallow depth of field, teal and orange colour grade, film grain',
    avoid: 'A busy list of subjects. One subject and one action reads better. Do not ask for logos, captions or readable text.',
  },
  {
    id: 'vintage', label: 'Vintage film photograph',
    summary: 'An old photo: faded colour or black and white, visible grain and the softness of an older lens.',
    look: 'Gentle focus that is never fully sharp. Corners darker than the middle. Small blemishes: scratches, dust, a light leak along one edge. Clothes, cars and rooms belong to the chosen decade.',
    colour: 'For colour: warm, faded tones, reds and yellows pushed, blues turned green or grey, blacks lifted to dark grey. For black and white: a full range of greys from deep black to cream white, often with a slight brown or blue tint.',
    light: 'Flat flash or plain daylight with soft contrast. Highlights burn out a little, shadows lose detail.',
    texture: 'Heavy grain, a paper-like surface, sometimes a white border or fold lines.',
    composition: 'Posed or snapshot framing: a centred subject, a slightly tilted horizon, people looking at the camera.',
    mood: 'Nostalgic, quiet, a little distant.',
    fits: 'A place or family scene as it might have looked decades ago, history and memory.',
    keywords: 'vintage photograph, faded colours, film grain, soft focus, vignette, light leak, aged paper, 1970s',
    avoid: 'Modern objects that do not fit the decade. Perfect sharpness. Say the decade in plain words so clothes and objects match.',
  },
  {
    id: 'cartoon', label: 'Cartoon',
    summary: 'A drawn picture with simple shapes, clear outlines and bold flat colour, made to read at a glance.',
    look: 'Thick, smooth outlines of even weight. Shapes are simplified and rounded; heads and eyes are large, hands have few fingers or simple mitten shapes. Faces show feeling with a few lines. Backgrounds use fewer details than the characters.',
    colour: 'Bright, saturated, flat fills with one or two tones of shading. A small palette per scene, with the main character in the strongest colour.',
    light: 'Even, with a simple shadow shape under the figure. No realistic reflections.',
    texture: 'Smooth and clean. At most a plain pattern on clothes or walls.',
    composition: 'Clear silhouettes, the character large in the frame, exaggerated poses and expressions, a plain backdrop that does not compete.',
    mood: 'Playful, friendly, funny.',
    fits: 'Characters, mascots, children\'s stories, jokes, simple explanations.',
    keywords: 'cartoon illustration, bold outlines, flat colours, simple shapes, expressive face, bright palette, clean background',
    avoid: 'Fine realistic detail, photographic lighting, complex textures. Leave out "realistic" and "detailed" or the style drifts.',
  },
  {
    id: 'anime', label: 'Anime',
    summary: 'Japanese animation style: clean lines, large expressive eyes, shaded colour and dynamic framing.',
    look: 'Thin, crisp outlines that vary slightly in weight. Large eyes with a bright highlight and layered colour, small nose and mouth, hair in sharp clumps with a glossy band of light. Bodies are slim with long limbs. Backgrounds are often more detailed and painterly than the figures.',
    colour: 'Clear, bright colours with cel shading: a flat base tone and one or two hard-edged shadow shapes. Skies have soft gradients. Hair and eyes often use unusual colours.',
    light: 'Soft glow from the sky or a window, a hard-edged shadow side, sparkle or bloom around bright areas, sunbeams, drifting petals or dust.',
    texture: 'Smooth, with no visible brush marks on characters. Backgrounds may show soft paint texture.',
    composition: 'Dynamic angles, wind in the hair and clothes, a close-up of the face with a distant city or sky behind, speed lines for action, wide skies.',
    mood: 'Dramatic, tender, adventurous or dreamy.',
    fits: 'Characters, school and city scenes, fantasy, quiet moments with a strong sky.',
    keywords: 'anime style, clean line art, cel shading, large expressive eyes, vibrant colours, detailed background, soft glow',
    avoid: 'Photographic skin pores, realistic proportions, heavy realistic shading. Name hair colour, eye colour and clothes, since the style leaves these open.',
  },
  {
    id: 'manga', label: 'Manga (black and white ink)',
    summary: 'A black and white page style from Japanese comics: ink lines, screen tones and strong contrast.',
    look: 'Confident ink lines that thicken in shadow and thin on distant things. Eyes and hair follow anime shapes but with more fine line work. Action is drawn with speed lines and impact bursts. Backgrounds can be sharp perspective drawings.',
    colour: 'Only black, white and greys. Grey comes from dot patterns (screen tones) and fine hatching, not smooth gradients.',
    light: 'Shown by large areas of solid black against white paper. A bright source is the empty white of the page.',
    texture: 'Dots, cross-hatching, fine parallel lines, ink splatter.',
    composition: 'Panels of different sizes, a tall close-up for emotion, a wide panel for a place, characters breaking out of the frame.',
    mood: 'Intense, serious or quiet, depending on how much black there is.',
    fits: 'Dramatic scenes, action, expressions, a page that tells a story.',
    keywords: 'manga page, black and white ink, screentone, hatching, dynamic panel layout, high contrast, detailed line work',
    avoid: 'Colour words. Soft airbrushed shading. Readable speech text, which image models spell badly.',
  },
  {
    id: 'comic', label: 'Comic book (western)',
    summary: 'Bold inked pages with colour printed in flat areas, dramatic poses and heavy shadows.',
    look: 'Strong black outlines with thick and thin variation, muscular or angular figures, foreshortened poses, hard shapes for shadows. Faces have firm jaws and brows. Backgrounds are simplified to keep the figures clear.',
    colour: 'Saturated primary colours in flat fills, with a halftone dot pattern or soft gradient in the shadows. Colours of one scene are tuned to one mood, such as purple and green for night.',
    light: 'Dramatic and graphic: solid black shadow shapes, a bright rim around the figure, glowing effects for energy.',
    texture: 'Visible ink, halftone dots, slightly rough paper tones.',
    composition: 'Low heroic angles, diagonal lines, a figure bursting toward the viewer, panel borders and bold sound-effect shapes.',
    mood: 'Heroic, tense, punchy.',
    fits: 'Heroes, villains, chases, action scenes, covers.',
    keywords: 'comic book illustration, bold ink outlines, halftone dots, dramatic shadows, saturated colours, dynamic pose',
    avoid: 'Soft pastel blending and photographic detail. Do not ask for text balloons or titles.',
  },
  {
    id: 'watercolor', label: 'Watercolour painting',
    summary: 'A painting in thin, transparent paint on paper, with soft edges and colour that runs together.',
    look: 'Shapes are suggested, not outlined. Edges are soft where wet paint spread and crisp where it dried. Small details are left out; a few fine brush lines add a branch, a face or a roof.',
    colour: 'Light, transparent colours that mix on the paper into new tints. Bright areas are bare white paper. Colours get stronger where layers overlap. Pale blues, greens, pinks and warm yellows are common.',
    light: 'Soft and airy. Light is the unpainted paper, and shadows are a thin wash of a cool colour.',
    texture: 'Visible paper grain, blooms and cauliflower edges where water pushed pigment, drips, pooled pigment along edges.',
    composition: 'Loose and open with plenty of white space, a focal point in sharper colour, edges that fade out instead of ending in a frame.',
    mood: 'Gentle, calm, dreamy, fresh.',
    fits: 'Landscapes, flowers, skies, seasons, quiet scenes, travel sketches.',
    keywords: 'watercolor painting, soft washes, wet on wet, visible paper texture, translucent colours, loose brushwork, white space',
    avoid: 'Hard black outlines, dense detail, strong shadows, glossy highlights. Those push it toward illustration.',
  },
  {
    id: 'oil', label: 'Oil painting',
    summary: 'A painting in thick, slow-drying paint, with rich colour, visible brush marks and deep, blended shadows.',
    look: 'Forms are built from patches of colour rather than lines. Brush strokes follow the shape of things: curved on a cheek, long on a sky. Edges blend in shadow and stay sharp where light hits. Detail is greatest at the focal point.',
    colour: 'Deep, full colours with a warm undertone. Shadows are dark browns and blues, not black. Skin is built from many small shifts of colour. Thick paint catches highlights.',
    light: 'Strong and directional with a clear shape of light and shadow, often one warm window or lamp in a dark room.',
    texture: 'Thick ridges of paint, canvas weave, small cracks of age, a glossy varnish on dark areas.',
    composition: 'Classical: a clear focal point, a balanced triangle of figures, a dark frame around a bright centre, a gentle depth from foreground to haze.',
    mood: 'Serious, warm, timeless, dramatic.',
    fits: 'Portraits, still life, landscapes, historic or formal scenes.',
    keywords: 'oil painting, visible brush strokes, rich colours, impasto, canvas texture, chiaroscuro, warm tones',
    avoid: 'Digital, neon or glossy plastic words. Thin outlines. Very bright flat colours.',
  },
  {
    id: 'pencil', label: 'Pencil sketch',
    summary: 'A drawing in graphite: grey lines and soft shading on paper, often unfinished at the edges.',
    look: 'Light construction lines stay visible under darker, confident ones. Shapes are found by repeating a line. The focal area is detailed, and the edges of the drawing fade to bare paper.',
    colour: 'Only greys from silvery light to deep dark. The paper is cream or white and shows through.',
    light: 'Shown by shading: smooth blends for rounded forms, cross-hatching for darker areas, a clean paper white for the brightest spots.',
    texture: 'Paper grain, smudges from the hand, eraser marks, pencil dust.',
    composition: 'A single subject, centred or off to one side, with a loose vignette around it. Sometimes small studies of a hand or an eye beside the main drawing.',
    mood: 'Quiet, thoughtful, personal.',
    fits: 'Portraits, objects, architecture studies, a drawing that looks hand made.',
    keywords: 'pencil sketch, graphite drawing, cross hatching, soft shading, visible construction lines, paper texture, monochrome',
    avoid: 'Colour words. Saturated fills. A finished, polished look.',
  },
  {
    id: 'ink', label: 'Ink line art',
    summary: 'A drawing made only of clean pen lines, with no filled colour, as in a book illustration or a coloring page.',
    look: 'Closed, even outlines for the main shapes, finer lines for detail, hatching and dots for shade. Nothing is painted or blended. Each area is clearly bounded.',
    colour: 'Black lines on white. For a coloring page, nothing is filled in at all.',
    light: 'Suggested by line density: more hatching where it is dark, empty white where it is bright.',
    texture: 'Crisp, flat, and printable. Line weight is the only texture.',
    composition: 'Clear separation of foreground and background, careful patterns, a full frame or a clean circular or square border.',
    mood: 'Neat, calm, decorative.',
    fits: 'Coloring pages, book illustrations, tattoos, logos, technical drawings.',
    keywords: 'black ink line art, clean outlines, no shading, white background, detailed illustration, coloring page',
    avoid: 'Any colour words, gradients, grey fills, shadows, background colour.',
  },
  {
    id: 'pixel', label: 'Pixel art',
    summary: 'A picture made of visible square pixels in a small palette, like an old video game.',
    look: 'Every shape is built from blocky pixels with hard stair-step edges. Characters are small and read by silhouette. Eyes can be one or two pixels. No smooth curves or blurs.',
    colour: 'A limited palette of 8 to 32 colours. Shading is done by stepping to a darker or lighter colour, never by blending. A dark outline in a deep colour, not pure black, often frames each shape.',
    light: 'Flat, with one highlight colour and one shadow colour per surface, and dithering (a checkerboard of two colours) for gradients.',
    texture: 'Pixel patterns for grass, brick or water, repeated in tiles.',
    composition: 'Side view or top-down, simple readable scenes, a horizon line, a tile grid. Sprites face left or right.',
    mood: 'Nostalgic, playful, adventurous.',
    fits: 'Game characters, items, maps, icons, retro scenes.',
    keywords: 'pixel art, 16-bit, limited colour palette, crisp square pixels, dithering, retro game sprite, no anti-aliasing',
    avoid: 'Words like smooth, realistic, high resolution or soft. Photographic lighting.',
  },
  {
    id: 'render3d', label: '3D render',
    summary: 'A picture that looks like it came from a 3D animation tool: smooth rounded forms, clean materials, soft lit scenes.',
    look: 'Smooth, rounded volumes with small bevels on every edge. Characters have large heads, big eyes and simple hands. Hair and fabric are shown as clumps with a soft sheen. Clean geometry and tidy props.',
    colour: 'Bright, harmonious colours with gentle gradients. Surfaces pick up colour from nearby objects.',
    light: 'Soft studio-style lighting: a main light, a fill, a rim. Soft shadows, ambient occlusion in corners, a gentle glow through thin things like ears and leaves.',
    texture: 'Material is clear: matte plastic, glossy ceramic, fuzzy felt, brushed metal. No grain.',
    composition: 'A centred subject, a slightly low camera, a shallow blur on the background, a simple stage with a few props.',
    mood: 'Friendly, polished, cheerful.',
    fits: 'Characters, products, icons, toys, children\'s film style scenes, isometric rooms.',
    keywords: '3D render, smooth shapes, soft studio lighting, subsurface scattering, ambient occlusion, pastel colours, high detail, depth of field',
    avoid: 'Hand-drawn outlines and visible brush marks. Harsh real-world grit unless you want it.',
  },
  {
    id: 'clay', label: 'Claymation',
    summary: 'A scene that looks made from modelling clay and filmed in small stop-motion sets.',
    look: 'Soft, slightly lumpy forms with rounded edges. Fingerprints and tool marks are visible. Faces are simple, with wide mouths and bead or button eyes. Props look handmade from cardboard, wire and fabric.',
    colour: 'Warm, saturated clay colours with small colour streaks where two clays mixed.',
    light: 'Miniature set lighting: a warm key light, small hard shadows, a shallow depth of field like a close camera on a tabletop.',
    texture: 'Matte clay with fingerprints, tiny cracks, smoothed seams, felt and cloth on the set.',
    composition: 'A small stage, characters at the front, a tilt-shift look where the top and bottom blur.',
    mood: 'Quirky, warm, homemade.',
    fits: 'Characters, animals, short stories, anything that should feel handmade.',
    keywords: 'claymation, stop motion, modelling clay, fingerprints texture, handmade miniature set, tilt shift, warm lighting',
    avoid: 'Sharp metal or glass, perfect symmetry, thin outlines.',
  },
  {
    id: 'vector', label: 'Flat vector illustration',
    summary: 'Clean shapes in flat colour with no outlines or shading, the look of modern icons, posters and app art.',
    look: 'Geometric, simplified shapes with smooth curves and exact edges. People are drawn with a few shapes and little detail in faces. Shapes overlap to make depth.',
    colour: 'A small, chosen palette of flat colours, often two to six, with high contrast between them. Gradients, if any, are gentle and between two colours.',
    light: 'Implied by a darker shape on one side, never by blended shadows.',
    texture: 'None. Optionally a light paper grain or small dot pattern over the whole picture.',
    composition: 'Centred or balanced with plenty of space, strong shapes, a simple background of circles, hills or buildings.',
    mood: 'Modern, friendly, tidy.',
    fits: 'Icons, posters, presentations, website pictures, infographics.',
    keywords: 'flat vector illustration, geometric shapes, solid colours, minimal, no outlines, limited palette, clean composition',
    avoid: 'Photographic detail, brush texture, heavy shadows, many tiny objects.',
  },
  {
    id: 'cyberpunk', label: 'Cyberpunk neon',
    summary: 'A dark city at night lit by neon signs, wet streets and glowing screens.',
    look: 'Tall, crowded buildings with layers of signs, cables, steam and rain. People wear layered clothes with glowing parts. Surfaces are metal, glass and wet asphalt. Details are dense and slightly worn.',
    colour: 'Deep blue and black with neon magenta, cyan, purple and orange, strong against the dark.',
    light: 'Neon from signs and screens, glowing reflections on wet ground, haze that makes beams visible, a few bright points against deep shadow.',
    texture: 'Wet shine, grime, glow bloom, small digital noise, glass reflections.',
    composition: 'A narrow street in strong perspective, a lone figure small against the city, tall vertical frames, mirrored reflections in puddles.',
    mood: 'Moody, lonely, high energy.',
    fits: 'Night cities, futuristic scenes, characters with technology.',
    keywords: 'cyberpunk city at night, neon lights, rain, wet reflections, volumetric haze, magenta and cyan glow, dense detail',
    avoid: 'Daylight, pastel colours, clean empty spaces. Real brand names and readable signs.',
  },
];

export const styleById = (id: string): PhotoStyle | undefined => PHOTO_STYLES.find((s) => s.id === id);

/** The short line that goes to the image model for a style. */
export const styleKeywords = (id: string): string => styleById(id)?.keywords ?? '';

/**
 * One style as a section of the guide. Every line carries the style's name in brackets and the lines are grouped in short
 * blocks, because a small model is shown only the pieces that fit its memory: each piece must say which style it is about.
 */
function section(s: PhotoStyle): string {
  const tag = `[${s.label}]`;
  return [
    [`## ${s.label}`, `${tag} ${s.summary}`, `${tag} Look: ${s.look}`],
    [`${tag} Colour: ${s.colour}`, `${tag} Light: ${s.light}`],
    [`${tag} Texture: ${s.texture}`, `${tag} Composition: ${s.composition}`],
    [`${tag} Mood: ${s.mood}`, `${tag} Suits: ${s.fits}`],
    [`${tag} Prompt line: ${s.keywords}`, `${tag} Avoid: ${s.avoid}`],
  ].map((block) => block.join('\n')).join('\n\n');
}

/** The whole guide as one text file, a section for each style. The skill carries it as a reference file. */
export const photoStyleGuide = (): string => `# Photo and picture styles\n\nWhat each style looks like, and a prompt line for an image model.\n\n${PHOTO_STYLES.map(section).join('\n\n')}\n`;
