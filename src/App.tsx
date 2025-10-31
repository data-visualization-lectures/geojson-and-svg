import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import './App.css';
import { convertSvgToGeoJson } from './converters/svgToGeojson';
import { convertGeoJsonToSvg } from './converters/geojsonToSvg';

type Mode = 'svg-to-geojson' | 'geojson-to-svg';
type FitMode = 'width' | 'height' | 'none';

const SVG_FILENAME = 'converted.geojson';
const GEOJSON_FILENAME = 'converted.svg';

function formatSvgMeta(metadata: { pathCount: number; featureCount: number; samplePoints: number }) {
  return `Paths: ${metadata.pathCount} · Features: ${metadata.featureCount} · Samples per path: ${metadata.samplePoints}`;
}

function formatGeoMeta(metadata: { elementCount: number; bbox: { minX: number; minY: number; maxX: number; maxY: number } | null }) {
  const bboxText = metadata.bbox
    ? `Bounds: [${metadata.bbox.minX.toFixed(2)}, ${metadata.bbox.minY.toFixed(2)}] → [${metadata.bbox.maxX.toFixed(
        2
      )}, ${metadata.bbox.maxY.toFixed(2)}]`
    : 'Bounds: n/a';
  return `SVG elements: ${metadata.elementCount} · ${bboxText}`;
}

function sanitizeNumber(value: string, fallback: number) {
  if (value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [mode, setMode] = useState<Mode>('svg-to-geojson');
  const [autoConvert, setAutoConvert] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const [svgInput, setSvgInput] = useState('');
  const [geoJsonInput, setGeoJsonInput] = useState('');

  const [geoJsonOutput, setGeoJsonOutput] = useState('');
  const [svgOutput, setSvgOutput] = useState('');

  const [geoJsonPreview, setGeoJsonPreview] = useState<FeatureCollection | null>(null);
  const [svgPreview, setSvgPreview] = useState('');

  const [metadataMessage, setMetadataMessage] = useState<string | null>(null);

  const [samplePoints, setSamplePoints] = useState(250);
  const [flipY, setFlipY] = useState(true);
  const [svgPrecision, setSvgPrecision] = useState(2);

  const [viewportWidth, setViewportWidth] = useState(640);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [pointRadius, setPointRadius] = useState(2);
  const [geoPrecision, setGeoPrecision] = useState(2);
  const [extentMode, setExtentMode] = useState<'auto' | 'custom'>('auto');
  const [extent, setExtent] = useState({
    left: -180,
    bottom: -90,
    right: 180,
    top: 90,
  });

  const inputValue = mode === 'svg-to-geojson' ? svgInput : geoJsonInput;
  const outputValue = mode === 'svg-to-geojson' ? geoJsonOutput : svgOutput;

  const extentDisabled = extentMode === 'auto';

  const runConversion = useCallback(async () => {
    const currentInput = mode === 'svg-to-geojson' ? svgInput : geoJsonInput;
    if (!currentInput.trim()) {
      setError(null);
      setStatus(null);
      if (mode === 'svg-to-geojson') {
        setGeoJsonOutput('');
        setGeoJsonPreview(null);
      } else {
        setSvgOutput('');
        setSvgPreview('');
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatus('変換中...');

    try {
      if (mode === 'svg-to-geojson') {
        const result = await convertSvgToGeoJson(currentInput, {
          samplePoints,
          flipY,
          precision: svgPrecision,
        });
        const formatted = JSON.stringify(result.collection, null, 2);
        setGeoJsonOutput(formatted);
        setGeoJsonPreview(result.collection);
        setSvgPreview('');
        setMetadataMessage(formatSvgMeta(result.metadata));
        setStatus('GeoJSONを生成しました。');
      } else {
        const result = convertGeoJsonToSvg(currentInput, {
          viewportWidth,
          viewportHeight,
          fitTo: fitMode === 'none' ? undefined : fitMode,
          precision: geoPrecision,
          pointRadius,
          mapExtentFromGeojson: extentMode === 'auto',
          mapExtent: extentMode === 'custom' ? extent : undefined,
        });
        setSvgOutput(result.svg);
        setSvgPreview(result.svg);
        setGeoJsonPreview(null);
        setMetadataMessage(formatGeoMeta(result.metadata));
        setStatus('SVGを生成しました。');
      }
    } catch (conversionError) {
      const message = conversionError instanceof Error ? conversionError.message : '不明なエラーが発生しました。';
      setError(message);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [
    extent,
    extentMode,
    fitMode,
    flipY,
    geoJsonInput,
    geoPrecision,
    mode,
    pointRadius,
    samplePoints,
    svgInput,
    svgPrecision,
    viewportHeight,
    viewportWidth,
  ]);

  useEffect(() => {
    if (!autoConvert) return;
    const timeout = window.setTimeout(() => {
      void runConversion();
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [
    autoConvert,
    extent.bottom,
    extent.left,
    extent.right,
    extent.top,
    fitMode,
    flipY,
    geoPrecision,
    inputValue,
    mode,
    pointRadius,
    runConversion,
    samplePoints,
    svgPrecision,
    viewportHeight,
    viewportWidth,
  ]);

  useEffect(() => {
    setError(null);
    setStatus(null);
  }, [mode]);

  const updateExtent = (key: keyof typeof extent) => (value: string) => {
    setExtent((prev) => ({
      ...prev,
      [key]: sanitizeNumber(value, prev[key]),
    }));
  };

  const handleConvertClick = () => {
    void runConversion();
  };

  const handleAutoToggle = (checked: boolean) => {
    setAutoConvert(checked);
    if (checked) {
      void runConversion();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (mode === 'svg-to-geojson' && file.type !== 'image/svg+xml') {
      setError('SVGファイルを選択してください。');
      return;
    }

    if (mode === 'geojson-to-svg' && !file.type.includes('json')) {
      setError('GeoJSON (JSON) ファイルを選択してください。');
      return;
    }

    const text = await file.text();
    if (mode === 'svg-to-geojson') {
      setSvgInput(text);
    } else {
      setGeoJsonInput(text);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = event.target;
    if (mode === 'svg-to-geojson') {
      setSvgInput(value);
    } else {
      setGeoJsonInput(value);
    }
  };

  const handleClear = () => {
    if (mode === 'svg-to-geojson') {
      setSvgInput('');
      setGeoJsonOutput('');
      setGeoJsonPreview(null);
    } else {
      setGeoJsonInput('');
      setSvgOutput('');
      setSvgPreview('');
    }
    setStatus(null);
    setMetadataMessage(null);
    setError(null);
  };

  const handleCopy = async () => {
    if (!outputValue) return;
    try {
      await navigator.clipboard.writeText(outputValue);
      setCopyFeedback('コピーしました。');
      window.setTimeout(() => setCopyFeedback(null), 1800);
    } catch (copyError) {
      const message = copyError instanceof Error ? copyError.message : 'クリップボードにコピーできませんでした。';
      setError(message);
    }
  };

  const handleDownload = () => {
    if (!outputValue) return;
    const filename = mode === 'svg-to-geojson' ? SVG_FILENAME : GEOJSON_FILENAME;
    const type = mode === 'svg-to-geojson' ? 'application/geo+json' : 'image/svg+xml';
    downloadText(outputValue, filename, type);
  };

  const optionSummary = useMemo(() => {
    if (mode === 'svg-to-geojson') {
      return `サンプル数: ${samplePoints} / Y反転: ${flipY ? 'ON' : 'OFF'} / 精度: ${svgPrecision}`;
    }
    return `ビューポート: ${viewportWidth}×${viewportHeight} / フィット: ${fitMode} / 精度: ${geoPrecision}`;
  }, [mode, samplePoints, flipY, svgPrecision, viewportWidth, viewportHeight, fitMode, geoPrecision]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>SVG ⇄ GeoJSON 変換ツール</h1>
        <p>Mapbox svg-to-geojson と geojson2svg を利用したブラウザ変換ユーティリティです。</p>
      </header>

      <section className="mode-toggle">
        <button
          type="button"
          className={mode === 'svg-to-geojson' ? 'mode-toggle__button is-active' : 'mode-toggle__button'}
          onClick={() => setMode('svg-to-geojson')}
        >
          SVG → GeoJSON
        </button>
        <button
          type="button"
          className={mode === 'geojson-to-svg' ? 'mode-toggle__button is-active' : 'mode-toggle__button'}
          onClick={() => setMode('geojson-to-svg')}
        >
          GeoJSON → SVG
        </button>
        <label className="mode-toggle__auto">
          <input
            type="checkbox"
            checked={autoConvert}
            onChange={(event) => handleAutoToggle(event.target.checked)}
          />
          自動変換
        </label>
      </section>

      <section className="panels">
        <div className="panel">
          <div className="panel__header">
            <h2>入力</h2>
            <div className="panel__controls">
              <label className="panel__file">
                ファイルを選択
                <input type="file" accept={mode === 'svg-to-geojson' ? '.svg' : '.json,.geojson'} onChange={handleFileUpload} />
              </label>
              <button type="button" onClick={handleClear}>
                クリア
              </button>
            </div>
          </div>
          <textarea
            className="panel__textarea"
            value={inputValue}
            onChange={handleInputChange}
            placeholder={mode === 'svg-to-geojson' ? '<svg>...</svg>' : '{ "type": "FeatureCollection", ... }'}
          />
          <div className="panel__footer">
            <span>{optionSummary}</span>
            <button type="button" onClick={handleConvertClick} disabled={isLoading}>
              変換を実行
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <h2>出力</h2>
            <div className="panel__controls">
              <button type="button" onClick={handleCopy} disabled={!outputValue}>
                コピー
              </button>
              <button type="button" onClick={handleDownload} disabled={!outputValue}>
                ダウンロード
              </button>
            </div>
          </div>
          <textarea className="panel__textarea panel__textarea--output" value={outputValue} readOnly placeholder="出力結果がここに表示されます。" />
          <div className="panel__footer">
            {metadataMessage && <span>{metadataMessage}</span>}
            {copyFeedback && <span className="panel__feedback">{copyFeedback}</span>}
          </div>
        </div>
      </section>

      <section className="options">
        {mode === 'svg-to-geojson' ? (
          <>
            <div className="options__group">
              <label>
                サンプル分割数
                <input
                  type="number"
                  min={50}
                  max={2000}
                  value={samplePoints}
                  onChange={(event) => setSamplePoints(sanitizeNumber(event.target.value, samplePoints))}
                />
              </label>
              <label>
                Y座標を反転
                <input type="checkbox" checked={flipY} onChange={(event) => setFlipY(event.target.checked)} />
              </label>
              <label>
                小数点桁
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={svgPrecision}
                  onChange={(event) => setSvgPrecision(Math.max(0, Math.min(6, Math.floor(Number(event.target.value) || svgPrecision))))}
                />
              </label>
            </div>
          </>
        ) : (
          <>
            <div className="options__group">
              <label>
                ビューポート幅
                <input
                  type="number"
                  min={64}
                  max={4096}
                  value={viewportWidth}
                  onChange={(event) => setViewportWidth(sanitizeNumber(event.target.value, viewportWidth))}
                />
              </label>
              <label>
                ビューポート高
                <input
                  type="number"
                  min={64}
                  max={4096}
                  value={viewportHeight}
                  onChange={(event) => setViewportHeight(sanitizeNumber(event.target.value, viewportHeight))}
                />
              </label>
              <label>
                フィット
                <select value={fitMode} onChange={(event) => setFitMode(event.target.value as FitMode)}>
                  <option value="width">幅優先</option>
                  <option value="height">高さ優先</option>
                  <option value="none">指定しない</option>
                </select>
              </label>
              <label>
                ポイント半径
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={pointRadius}
                  onChange={(event) => setPointRadius(sanitizeNumber(event.target.value, pointRadius))}
                />
              </label>
              <label>
                小数点桁
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={geoPrecision}
                  onChange={(event) => setGeoPrecision(Math.max(0, Math.min(6, Math.floor(Number(event.target.value) || geoPrecision))))}
                />
              </label>
            </div>

            <div className="options__group">
              <label className="options__toggle">
                <input
                  type="radio"
                  name="extent-mode"
                  value="auto"
                  checked={extentMode === 'auto'}
                  onChange={() => setExtentMode('auto')}
                />
                Extent: GeoJSONから自動計算
              </label>
              <label className="options__toggle">
                <input
                  type="radio"
                  name="extent-mode"
                  value="custom"
                  checked={extentMode === 'custom'}
                  onChange={() => setExtentMode('custom')}
                />
                Extent: 手動指定
              </label>
            </div>

            <div className="options__group options__group--grid">
              <label>
                left
                <input
                  type="number"
                  value={extent.left}
                  onChange={(event) => updateExtent('left')(event.target.value)}
                  disabled={extentDisabled}
                />
              </label>
              <label>
                bottom
                <input
                  type="number"
                  value={extent.bottom}
                  onChange={(event) => updateExtent('bottom')(event.target.value)}
                  disabled={extentDisabled}
                />
              </label>
              <label>
                right
                <input
                  type="number"
                  value={extent.right}
                  onChange={(event) => updateExtent('right')(event.target.value)}
                  disabled={extentDisabled}
                />
              </label>
              <label>
                top
                <input
                  type="number"
                  value={extent.top}
                  onChange={(event) => updateExtent('top')(event.target.value)}
                  disabled={extentDisabled}
                />
              </label>
            </div>
          </>
        )}
      </section>

      <section className="preview">
        {mode === 'geojson-to-svg' && svgPreview && (
          <div className="preview__pane">
            <h3>SVGプレビュー</h3>
            <div className="preview__canvas" dangerouslySetInnerHTML={{ __html: svgPreview }} />
          </div>
        )}

        {mode === 'svg-to-geojson' && geoJsonPreview && (
          <div className="preview__pane">
            <h3>GeoJSONプレビュー</h3>
            <pre className="preview__pre">{JSON.stringify(geoJsonPreview, null, 2)}</pre>
          </div>
        )}
      </section>

      <footer className="status">
        {isLoading && <span className="status__item">処理中…</span>}
        {status && <span className="status__item">{status}</span>}
        {error && <span className="status__item status__item--error">{error}</span>}
        <span className="status__spacer" />
        <a className="status__link" href="https://www.dataviz.jp/" target="_blank" rel="noreferrer">
          DataViz.jp
        </a>
        <a className="status__link" href="https://visualizing.jp/" target="_blank" rel="noreferrer">
          Visualizing.jp
        </a>
      </footer>
    </div>
  );
}

export default App;
