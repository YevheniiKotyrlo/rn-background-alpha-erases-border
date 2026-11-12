// Reads the left border edge of each view in the screenshot reproduce.sh takes, and exits 1 while a view whose background
// alpha is 128 draws its red border at another alpha than half, 0 once each draws it at half, 2 when the screenshot shows
// nothing.
// Usage: node read-border-alpha.mjs <screenshot.png> <screen WxH> <border width in px>
//   "<view left untouched>=<left>,<top>,<right>,<bottom>" "<view at background alpha 128>=<left>,<top>,<right>,<bottom>"...
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

// Over the gray background, red minus green grows with the alpha the red border is drawn at, so a border's alpha is its
// red minus green against the untouched view's, which a screen dimmed as a whole scales alike.
const halfAlpha = 128;
const halfAlphaTolerance = 24;
const goneAlpha = 16;
const leastUntouchedRedness = 128;

function fail(message) {
  console.log(`step failed: ${message}`);
  process.exit(2);
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) {
    return left;
  }
  return toUp <= toUpLeft ? up : upLeft;
}

function predictor(filter, left, up, upLeft) {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return (left + up) >> 1;
    case 4:
      return paeth(left, up, upLeft);
    default:
      throw new Error(`unknown PNG row filter ${filter}`);
  }
}

function decodePng(path) {
  const file = readFileSync(path);
  if (file.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`${path} is not a PNG`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const compressed = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('latin1', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [bitDepth, colorType] = [body[8], body[9]];
      const interlaced = body[12] !== 0;
      if (bitDepth !== 8 || interlaced || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`${path} is not an 8-bit, non-interlaced RGB or RGBA PNG`);
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      compressed.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const filtered = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  const emptyRow = Buffer.alloc(stride);
  for (let row = 0; row < height; row += 1) {
    const filter = filtered[row * (stride + 1)];
    const line = filtered.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1));
    const current = pixels.subarray(row * stride, (row + 1) * stride);
    const previous = row > 0 ? pixels.subarray((row - 1) * stride, row * stride) : emptyRow;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? current[index - channels] : 0;
      const upLeft = index >= channels ? previous[index - channels] : 0;
      current[index] = (line[index] + predictor(filter, left, previous[index], upLeft)) & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function parseView(argument) {
  const match = /^(.+)=(\d+),(\d+),(\d+),(\d+)$/.exec(argument);
  if (!match) {
    fail(`"${argument}" is not "<view>=<left>,<top>,<right>,<bottom>"`);
  }
  const [left, top, right, bottom] = match.slice(2).map(Number);
  return { name: match[1], left, top, right, bottom };
}

// The mean color of the 3x3 pixels in the middle of the view's left border edge.
function leftBorderEdge(screenshot, view, borderWidth) {
  const centerX = view.left + Math.floor(borderWidth / 2);
  const centerY = Math.floor((view.top + view.bottom) / 2);
  const sums = [0, 0, 0];
  for (let y = centerY - 1; y <= centerY + 1; y += 1) {
    for (let x = centerX - 1; x <= centerX + 1; x += 1) {
      const index = (y * screenshot.width + x) * screenshot.channels;
      for (let channel = 0; channel < 3; channel += 1) {
        sums[channel] += screenshot.pixels[index + channel];
      }
    }
  }
  const [red, green, blue] = sums.map((sum) => Math.round(sum / 9));
  return { red, green, blue, redness: Math.max(0, red - green) };
}

function joinNames(names) {
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function main(argumentList) {
  const [screenshotPath, screenArgument, borderArgument, untouchedArgument, ...halfAlphaArguments] = argumentList;
  const screenMatch = /^(\d+)x(\d+)$/.exec(screenArgument ?? '');
  if (!screenshotPath || !screenMatch || !/^\d+$/.test(borderArgument ?? '') || !untouchedArgument) {
    fail('usage: read-border-alpha.mjs <screenshot.png> <WxH> <border px> "<view>=<l>,<t>,<r>,<b>"...');
  }
  if (halfAlphaArguments.length === 0) {
    fail('no view at background alpha 128 to read');
  }
  let screenshot;
  try {
    screenshot = decodePng(screenshotPath);
  } catch (error) {
    fail(`reading the screenshot: ${error.message}`);
  }
  const [screenWidth, screenHeight] = screenMatch.slice(1).map(Number);
  if (screenshot.width !== screenWidth || screenshot.height !== screenHeight) {
    fail(
      `the screenshot is ${screenshot.width}x${screenshot.height}, where the window the view bounds come from is` +
        ` ${screenWidth}x${screenHeight}`,
    );
  }
  const borderWidth = Number(borderArgument);

  const untouched = parseView(untouchedArgument);
  const untouchedEdge = leftBorderEdge(screenshot, untouched, borderWidth);
  console.log(
    `${untouched.name}: left border edge rgb(${untouchedEdge.red}, ${untouchedEdge.green}, ${untouchedEdge.blue})`,
  );
  if (untouchedEdge.redness < leastUntouchedRedness) {
    console.log(
      'SUMMARY: the view whose background alpha is untouched draws no red border, so the screenshot shows nothing',
    );
    process.exit(2);
  }

  const gone = [];
  const wrong = [];
  for (const view of halfAlphaArguments.map(parseView)) {
    const edge = leftBorderEdge(screenshot, view, borderWidth);
    const alpha = Math.min(255, Math.round((edge.redness / untouchedEdge.redness) * 255));
    console.log(
      `${view.name}: left border edge rgb(${edge.red}, ${edge.green}, ${edge.blue}), red border alpha ${alpha},` +
        ` where ${halfAlpha} is half`,
    );
    const border = `the ${view.name.split(', ')[0]}`;
    if (alpha <= goneAlpha) {
      gone.push(border);
    } else if (Math.abs(alpha - halfAlpha) > halfAlphaTolerance) {
      wrong.push(`${border} shows at alpha ${alpha}`);
    }
  }
  if (gone.length === 0 && wrong.length === 0) {
    console.log('SUMMARY: with view.background.alpha = 128, each view draws its red border at half its alpha');
    process.exit(0);
  }
  const findings = [...wrong];
  if (gone.length > 0) {
    findings.unshift(`${joinNames(gone)} ${gone.length === 1 ? 'is' : 'are'} gone`);
  }
  const each = gone.length + wrong.length === 1 ? 'it' : 'each';
  console.log(
    `SUMMARY: with view.background.alpha = 128, ${findings.join(', and ')}, where ${each} should show at half its alpha`,
  );
  process.exit(1);
}

main(process.argv.slice(2));
