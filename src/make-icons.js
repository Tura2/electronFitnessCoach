// scripts/make-icons.js
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('png-to-ico');

(async () => {
  const src = path.resolve('resources/icon-source.png');
  const out = path.resolve('resources/icons');
  fs.mkdirSync(out, { recursive: true });

  const sizes = [16,24,32,48,64,128,256,512];
  await Promise.all(
    sizes.map((s) =>
      sharp(src).resize(s, s).png().toFile(path.join(out, `icon-${s}.png`))
    )
  );

  // ICO ל-Windows (עד 256px)
  const icoBuf = await toIco(sizes.filter(s => s <= 256).map(s => path.join(out, `icon-${s}.png`)));
  fs.writeFileSync(path.join(out, 'app.ico'), icoBuf);

  console.log('✔ icons ready in resources/icons');
})();
