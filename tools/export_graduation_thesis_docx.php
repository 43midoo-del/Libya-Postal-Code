<?php
/**
 * Export docs/ar/graduation-thesis.md to a Word .docx (RTL Arabic).
 * Usage: php tools/export_graduation_thesis_docx.php
 */
declare(strict_types=1);

$root = dirname(__DIR__);
$mdPath = $root . '/docs/ar/graduation-thesis.md';
$outPath = $root . '/docs/ar/graduation-thesis.docx';

if (!is_readable($mdPath)) {
    fwrite(STDERR, "Missing: $mdPath\n");
    exit(1);
}

$md = file_get_contents($mdPath);
if ($md === false) {
    fwrite(STDERR, "Cannot read markdown.\n");
    exit(1);
}

function esc(string $s): string
{
    return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

function para(string $text, string $style = 'Normal', bool $bold = false): string
{
    $text = esc(trim($text));
    if ($text === '') {
        return '';
    }
    $rPr = $bold ? '<w:rPr><w:b/><w:rtl/></w:rPr>' : '<w:rPr><w:rtl/></w:rPr>';
    return '<w:p><w:pPr><w:pStyle w:val="' . esc($style) . '"/><w:jc w:val="right"/><w:bidi/></w:pPr>'
        . '<w:r>' . $rPr . '<w:t xml:space="preserve">' . $text . '</w:t></w:r></w:p>';
}

function heading(string $text, int $level): string
{
    $style = match ($level) {
        1 => 'Heading1',
        2 => 'Heading2',
        3 => 'Heading3',
        default => 'Heading4',
    };
    return para($text, $style, true);
}

function codeBlock(string $text): string
{
    $lines = preg_split('/\r\n|\r|\n/', $text) ?: [];
    $xml = '<w:p><w:pPr><w:jc w:val="left"/><w:bidi/></w:pPr></w:p>';
    foreach ($lines as $line) {
        $xml .= '<w:p><w:pPr><w:jc w:val="left"/><w:bidi/></w:pPr>'
            . '<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:rtl/></w:rPr>'
            . '<w:t xml:space="preserve">' . esc($line) . '</w:t></w:r></w:p>';
    }
    return $xml;
}

function tableFromMarkdown(array $rows): string
{
    if ($rows === []) {
        return '';
    }
    $cols = max(array_map('count', $rows));
    $tblPr = '<w:tblPr><w:bidiVisual/><w:tblW w:w="5000" w:type="pct"/>'
        . '<w:tblBorders>'
        . '<w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/>'
        . '<w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/>'
        . '<w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>'
        . '</w:tblBorders></w:tblPr>';
    $grid = '<w:tblGrid>';
    for ($i = 0; $i < $cols; $i++) {
        $grid .= '<w:gridCol w:w="2000"/>';
    }
    $grid .= '</w:tblGrid>';

    $body = '';
    foreach ($rows as $rIdx => $row) {
        $body .= '<w:tr>';
        for ($c = 0; $c < $cols; $c++) {
            $cell = $row[$c] ?? '';
            $bold = $rIdx === 0;
            $body .= '<w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr>'
                . '<w:p><w:pPr><w:jc w:val="right"/><w:bidi/></w:pPr>'
                . '<w:r><w:rPr>' . ($bold ? '<w:b/>' : '') . '<w:rtl/></w:rPr>'
                . '<w:t xml:space="preserve">' . esc(trim($cell)) . '</w:t></w:r></w:p>'
                . '</w:tc>';
        }
        $body .= '</w:tr>';
    }
    return '<w:tbl>' . $tblPr . $grid . $body . '</w:tbl>';
}

function parseMd(string $md): string
{
    $lines = preg_split('/\r\n|\r|\n/', $md) ?: [];
    $xml = '';
    $inCode = false;
    $codeBuf = [];
    $tableBuf = [];
    $inTable = false;
    $skipUntil = null;

    $flushTable = static function () use (&$tableBuf, &$inTable, &$xml): void {
        if (!$inTable || $tableBuf === []) {
            $tableBuf = [];
            $inTable = false;
            return;
        }
        $rows = [];
        foreach ($tableBuf as $line) {
            if (preg_match('/^\|?.+\|.+\|?$/', $line) !== 1) {
                continue;
            }
            $parts = array_map('trim', explode('|', trim($line, '|')));
            if ($parts !== [] && !preg_match('/^:?-+:?$/', str_replace(' ', '', $parts[0] ?? ''))) {
                $rows[] = $parts;
            }
        }
        if ($rows !== []) {
            $xml .= tableFromMarkdown($rows);
            $xml .= para('');
        }
        $tableBuf = [];
        $inTable = false;
    };

    foreach ($lines as $line) {
        $trim = trim($line);

        if ($skipUntil !== null) {
            if ($trim === $skipUntil) {
                $skipUntil = null;
            }
            continue;
        }
        if ($trim === '\\newpage') {
            $flushTable();
            $xml .= '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
            continue;
        }
        if ($trim === '---') {
            $flushTable();
            continue;
        }

        if (str_starts_with($trim, '```')) {
            if ($inCode) {
                $xml .= codeBlock(implode("\n", $codeBuf));
                $codeBuf = [];
                $inCode = false;
            } else {
                $flushTable();
                $inCode = true;
            }
            continue;
        }
        if ($inCode) {
            $codeBuf[] = $line;
            continue;
        }

        if (str_starts_with($trim, '|')) {
            $inTable = true;
            $tableBuf[] = $trim;
            continue;
        }
        if ($inTable) {
            $flushTable();
        }

        if ($trim === '') {
            continue;
        }
        if (preg_match('/^#{1,6}\s+(.+)$/', $trim, $m) === 1) {
            $level = strlen(strtok($trim, ' ')) - 1;
            $xml .= heading($m[1], min($level, 3));
            continue;
        }
        if (preg_match('/^>\s*(.+)$/', $trim, $m) === 1) {
            $xml .= para($m[1], 'Quote');
            continue;
        }
        if (preg_match('/^[-*]\s+(.+)$/', $trim, $m) === 1) {
            $xml .= para('• ' . $m[1]);
            continue;
        }
        if (preg_match('/^\d+\.\s+(.+)$/', $trim, $m) === 1) {
            $xml .= para($trim);
            continue;
        }

        $plain = preg_replace('/\*\*(.+?)\*\*/', '$1', $trim) ?? $trim;
        $plain = preg_replace('/`([^`]+)`/', '$1', $plain) ?? $plain;
        $xml .= para($plain);
    }

    $flushTable();
    if ($inCode && $codeBuf !== []) {
        $xml .= codeBlock(implode("\n", $codeBuf));
    }

    return $xml;
}

$body = parseMd($md);

$documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    . '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    . 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    . '<w:body>' . $body
    . '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
    . '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>'
    . '<w:bidi/></w:sectPr></w:body></w:document>';

$stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    . '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    . '<w:docDefaults><w:rPrDefault><w:rPr><w:rtl/><w:lang w:val="ar-SA"/></w:rPr></w:rPrDefault></w:docDefaults>'
    . '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'
    . '<w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="right"/><w:bidi/></w:pPr>'
    . '<w:rPr><w:rtl/><w:sz w:val="24"/><w:lang w:val="ar-SA"/></w:rPr></w:style>'
    . '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>'
    . '<w:pPr><w:jc w:val="center"/><w:bidi/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:rtl/></w:rPr></w:style>'
    . '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>'
    . '<w:pPr><w:jc w:val="right"/><w:bidi/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:rtl/></w:rPr></w:style>'
    . '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/>'
    . '<w:pPr><w:jc w:val="right"/><w:bidi/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:rtl/></w:rPr></w:style>'
    . '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/>'
    . '<w:pPr><w:jc w:val="center"/><w:bidi/></w:pPr><w:rPr><w:i/><w:sz w:val="24"/><w:rtl/></w:rPr></w:style>'
    . '</w:styles>';

$contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    . '<Default Extension="xml" ContentType="application/xml"/>'
    . '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    . '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    . '</Types>';

$rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    . '</Relationships>';

$docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    . '</Relationships>';

if (file_exists($outPath)) {
    unlink($outPath);
}

$zip = new ZipArchive();
if ($zip->open($outPath, ZipArchive::CREATE) !== true) {
    fwrite(STDERR, "Cannot create zip: $outPath\n");
    exit(1);
}

$zip->addFromString('[Content_Types].xml', $contentTypes);
$zip->addFromString('_rels/.rels', $rels);
$zip->addFromString('word/document.xml', $documentXml);
$zip->addFromString('word/styles.xml', $stylesXml);
$zip->addFromString('word/_rels/document.xml.rels', $docRels);
$zip->close();

echo "Written: $outPath\n";
echo "Size: " . filesize($outPath) . " bytes\n";
