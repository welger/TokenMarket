const { deflateSync } = require('node:zlib');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..', 'miniprogram', 'assets');
const tabbarDir = join(root, 'tabbar');
const iconsDir = join(root, 'icons');
mkdirSync(tabbarDir, { recursive: true });
mkdirSync(iconsDir, { recursive: true });

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffers) {
  let crc = 0xffffffff;
  for (const buffer of buffers) {
    for (const byte of buffer) {
      crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32([typeBuffer, data]));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function png(width, height, pixels) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * width * 4;
    const targetStart = y * (width * 4 + 1) + 1;
    pixels.copy(scanlines, targetStart, sourceStart, sourceStart + width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function create(size = 128) {
  return {
    size,
    pixels: Buffer.alloc(size * size * 4),
  };
}

function hex(color, alpha = 255) {
  const value = color.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    alpha,
  ];
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.size || y >= image.size) {
    return;
  }
  const index = (Math.round(y) * image.size + Math.round(x)) * 4;
  image.pixels[index] = color[0];
  image.pixels[index + 1] = color[1];
  image.pixels[index + 2] = color[2];
  image.pixels[index + 3] = color[3];
}

function fillCircle(image, cx, cy, radius, color) {
  for (let y = Math.floor(cy - radius); y <= cy + radius; y += 1) {
    for (let x = Math.floor(cx - radius); x <= cx + radius; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
        setPixel(image, x, y, color);
      }
    }
  }
}

function fillRoundedRect(image, x, y, width, height, radius, color) {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const dx = Math.max(x - px, 0, px - (x + width - 1));
      const dy = Math.max(y - py, 0, py - (y + height - 1));
      const inCorner =
        (px < x + radius || px >= x + width - radius) &&
        (py < y + radius || py >= y + height - radius);
      const cx = px < x + radius ? x + radius : x + width - radius - 1;
      const cy = py < y + radius ? y + radius : y + height - radius - 1;
      if (!inCorner || (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2 || dx + dy === 0) {
        setPixel(image, px, py, color);
      }
    }
  }
}

function line(image, x1, y1, x2, y2, color, width = 6) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    fillCircle(image, x, y, width / 2, color);
  }
}

function rectStroke(image, x, y, w, h, color, width = 6) {
  line(image, x, y, x + w, y, color, width);
  line(image, x + w, y, x + w, y + h, color, width);
  line(image, x + w, y + h, x, y + h, color, width);
  line(image, x, y + h, x, y, color, width);
}

function save(path, image) {
  writeFileSync(path, png(image.size, image.size, image.pixels));
}

function tabIcon(name, color, draw) {
  const image = create(96);
  draw(image, hex(color));
  save(join(tabbarDir, `${name}.png`), image);
}

function squareIcon(name, bg, draw, size = 128) {
  const image = create(size);
  fillRoundedRect(image, 8, 8, size - 16, size - 16, 24, hex(bg));
  draw(image, hex('#ffffff'));
  save(join(iconsDir, `${name}.png`), image);
}

function paleIcon(name, bg, color, draw) {
  const image = create(96);
  fillRoundedRect(image, 4, 4, 88, 88, 18, hex(bg));
  draw(image, hex(color));
  save(join(iconsDir, `${name}.png`), image);
}

function home(image, color) {
  line(image, 18, 44, 48, 18, color, 7);
  line(image, 48, 18, 78, 44, color, 7);
  rectStroke(image, 28, 43, 40, 32, color, 7);
}

function services(image, color) {
  line(image, 24, 34, 48, 22, color, 6);
  line(image, 48, 22, 72, 34, color, 6);
  line(image, 24, 34, 48, 46, color, 6);
  line(image, 48, 46, 72, 34, color, 6);
  line(image, 24, 50, 48, 62, color, 6);
  line(image, 48, 62, 72, 50, color, 6);
  line(image, 24, 66, 48, 78, color, 6);
  line(image, 48, 78, 72, 66, color, 6);
}

function consoleIcon(image, color) {
  rectStroke(image, 18, 24, 60, 48, color, 6);
  line(image, 30, 40, 42, 48, color, 5);
  line(image, 30, 56, 42, 48, color, 5);
  line(image, 50, 58, 66, 58, color, 5);
}

function profile(image, color) {
  line(image, 26, 78, 34, 62, color, 6);
  line(image, 34, 62, 62, 62, color, 6);
  line(image, 62, 62, 70, 78, color, 6);
  fillCircle(image, 48, 34, 14, color);
}

for (const [name, draw] of [
  ['home', home],
  ['services', services],
  ['console', consoleIcon],
  ['profile', profile],
]) {
  tabIcon(name, '#8a8f99', draw);
  tabIcon(`${name}-active`, '#07C160', draw);
}

squareIcon('models', '#07C160', (image, color) => {
  services(image, color);
});
squareIcon('plans', '#07C160', (image, color) => {
  rectStroke(image, 28, 32, 72, 50, color, 8);
  line(image, 32, 48, 96, 48, color, 8);
  line(image, 72, 70, 88, 70, color, 6);
});
squareIcon('api-docs', '#07C160', (image, color) => {
  rectStroke(image, 36, 24, 52, 76, color, 8);
  line(image, 54, 42, 78, 42, color, 6);
  line(image, 54, 58, 78, 58, color, 6);
});
squareIcon('model-primary', '#2aa882', (image, color) => {
  fillCircle(image, 64, 64, 30, color);
  fillCircle(image, 64, 64, 20, hex('#2aa882'));
  line(image, 35, 64, 93, 64, color, 6);
  line(image, 64, 35, 64, 93, color, 6);
});
squareIcon('model-secondary', '#4267f6', (image, color) => {
  fillCircle(image, 42, 44, 12, color);
  fillCircle(image, 84, 44, 12, color);
  fillCircle(image, 64, 82, 12, color);
  line(image, 42, 44, 84, 44, color, 5);
  line(image, 42, 44, 64, 82, color, 5);
  line(image, 84, 44, 64, 82, color, 5);
});
paleIcon('usage-calls', '#e6f7ed', '#07A84F', (image, color) => {
  fillCircle(image, 48, 48, 26, color);
  fillCircle(image, 48, 48, 20, hex('#e6f7ed'));
  line(image, 28, 50, 40, 50, color, 5);
  line(image, 40, 50, 46, 38, color, 5);
  line(image, 46, 38, 54, 60, color, 5);
  line(image, 54, 60, 62, 48, color, 5);
  line(image, 62, 48, 70, 48, color, 5);
});
paleIcon('usage-input', '#e6f7ed', '#07A84F', (image, color) => {
  rectStroke(image, 24, 26, 28, 34, color, 4);
  rectStroke(image, 44, 36, 28, 34, color, 4);
  line(image, 32, 52, 38, 34, color, 4);
  line(image, 38, 34, 46, 52, color, 4);
  line(image, 34, 46, 43, 46, color, 4);
});
paleIcon('support', '#e6f7ed', '#07A84F', (image, color) => {
  line(image, 24, 52, 24, 44, color, 5);
  line(image, 72, 52, 72, 44, color, 5);
  fillCircle(image, 48, 44, 26, color);
  fillCircle(image, 48, 44, 20, hex('#e6f7ed'));
  line(image, 58, 70, 70, 62, color, 5);
});
paleIcon('safety', '#e6f7ed', '#07A84F', (image, color) => {
  line(image, 48, 18, 72, 28, color, 5);
  line(image, 72, 28, 68, 58, color, 5);
  line(image, 68, 58, 48, 76, color, 5);
  line(image, 48, 76, 28, 58, color, 5);
  line(image, 28, 58, 24, 28, color, 5);
  line(image, 24, 28, 48, 18, color, 5);
  line(image, 36, 48, 46, 58, color, 5);
  line(image, 46, 58, 62, 40, color, 5);
});
paleIcon('right', '#ffffff', '#8a8f99', (image, color) => {
  line(image, 38, 28, 58, 48, color, 6);
  line(image, 58, 48, 38, 68, color, 6);
});
