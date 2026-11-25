import { useEffect, useRef, useState, type FormEvent } from "react";
import { MixedHeadline } from "../../components/editorial";
import { Button } from "../../components/ui";
import { generateImage } from "./api";
import { useAiImagesCatalog } from "./catalog";
import "./ai-images.css";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

function ImageWorkspace() {
  const { catalog, loading, error, retry } = useAiImagesCatalog();
  const [templateId, setTemplateId] = useState("");
  const [modelId, setModelId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [references, setReferences] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState("");
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const template = catalog?.templates.find((item) => item.id === templateId);
  const models = catalog?.models.filter((model) => template?.modelIds.includes(model.id)) ?? [];

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!result) {
      setResultUrl("");
      return;
    }
    const url = URL.createObjectURL(result);
    setResultUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    setModelId("");
    setReferences([]);
    setFileError("");
    setRequestError("");
  }

  function chooseFiles(files: File[]) {
    setReferences([]);
    if (files.length > (template?.referenceImageCount ?? 0)) {
      setFileError(`请选择 ${template?.referenceImageCount ?? 0} 张参考图。`);
    } else if (files.some((file) => !IMAGE_TYPES.includes(file.type))) {
      setFileError("请选择 PNG、JPEG 或 WebP 图片。 ");
    } else if (files.some((file) => file.size > MAX_FILE_SIZE)) {
      setFileError("每张参考图不能超过 5 MiB。 ");
    } else {
      setFileError("");
      setReferences(files);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      inFlight.current ||
      !template ||
      template.referenceImageCount > 2 ||
      !modelId ||
      !models.some((model) => model.id === modelId) ||
      fileError ||
      references.length !== template.referenceImageCount
    )
      return;
    inFlight.current = true;
    const abortController = new AbortController();
    controller.current = abortController;
    setGenerating(true);
    setRequestError("");
    try {
      const blob = await generateImage(
        { templateId: template.id, modelId, instructions, references },
        abortController.signal,
      );
      if (!abortController.signal.aborted) setResult(blob);
    } catch (err) {
      if (!abortController.signal.aborted)
        setRequestError(err instanceof Error ? err.message : "生成失败，请稍后重试。 ");
    } finally {
      inFlight.current = false;
      if (!abortController.signal.aborted) setGenerating(false);
    }
  }

  const extension =
    result?.type === "image/jpeg" ? "jpg" : result?.type === "image/webp" ? "webp" : "png";

  return (
    <div className="aiImages">
      <div className="adminHeading aiImagesHeading">
        <div>
          <p className="meta">EDITORIAL TOOLS / IMAGE STUDIO</p>
          <MixedHeadline>AI 生图</MixedHeadline>
        </div>
        <span>创作工具 / 01</span>
      </div>
      {loading ? (
        <p role="status">正在加载生图模板…</p>
      ) : error ? (
        <div className="aiNotice aiNoticeError" role="alert">
          <p>{error}</p>
          <button type="button" className="ghost" onClick={retry}>
            重新加载
          </button>
        </div>
      ) : catalog?.issue === "invalid_configuration" ? (
        <div className="aiNotice aiNoticeError" role="alert">
          <strong>AI 生图配置无效</strong>
          <p>请检查后端生图配置和密钥后重启服务。刊物编辑不受影响。</p>
        </div>
      ) : !catalog?.enabled ? (
        <p className="aiNotice">AI 生图暂未启用。</p>
      ) : catalog.templates.length === 0 ? (
        <p className="aiNotice">暂无可用的生图模板。</p>
      ) : (
        <div className="aiWorkspace">
          <form className="aiControls" onSubmit={submit}>
            <fieldset disabled={generating}>
              <div className="aiSectionHeading">
                <span>01 / TEMPLATE</span>
                <h2>选择模板</h2>
              </div>
              <div className="aiTemplates" role="radiogroup" aria-label="生图模板">
                {catalog.templates.map((item) => (
                  <label
                    className={`aiTemplate ${templateId === item.id ? "selected" : ""}`}
                    key={item.id}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={item.id}
                      checked={templateId === item.id}
                      onChange={() => chooseTemplate(item.id)}
                    />
                    <span className="aiTemplateBody">
                      <span className="aiTemplateTop">
                        <strong>{item.label}</strong>
                        <span>{item.referenceImageCount ? "参考图" : "文生图"}</span>
                      </span>
                      <span className="aiTemplateDescription">{item.description}</span>
                      <span className="aiTemplateMeta">
                        {item.aspectRatio}{" "}
                        {item.referenceImageCount > 0 && `/ ${item.referenceImageCount} 张参考图`}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {template && (
                <div className="aiSettings">
                  <div className="aiSectionHeading">
                    <span>02 / DETAILS</span>
                    <h2>设置生成内容</h2>
                  </div>
                  <label className="aiField" htmlFor="ai-model">
                    <span>选择模型</span>
                    <select
                      id="ai-model"
                      value={modelId}
                      onChange={(event) => setModelId(event.target.value)}
                      required
                    >
                      <option value="">
                        {models.length ? "请选择支持此模板的模型" : "此模板暂无可用模型"}
                      </option>
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {template.referenceImageCount > 2 ? (
                    <p className="aiError" role="alert">
                      此模板需要超过 2 张参考图，暂不支持。
                    </p>
                  ) : (
                    template.referenceImageCount > 0 && (
                      <div className="aiField">
                        <label htmlFor="ai-references">
                          参考图{" "}
                          <span className="aiOptional">
                            （需要 {template.referenceImageCount} 张）
                          </span>
                        </label>
                        <input
                          key={template.id}
                          id="ai-references"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          multiple={template.referenceImageCount > 1}
                          onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))}
                          aria-describedby={
                            fileError ? "ai-reference-help ai-reference-error" : "ai-reference-help"
                          }
                        />
                        <small id="ai-reference-help">
                          PNG、JPEG 或 WebP，每张不超过 5 MiB。已选择 {references.length} /{" "}
                          {template.referenceImageCount} 张
                        </small>
                        {references.length > 0 && (
                          <ul className="aiFileList">
                            {references.map((file, index) => (
                              <li key={`${file.name}-${index}`}>{file.name}</li>
                            ))}
                          </ul>
                        )}
                        {fileError && (
                          <small id="ai-reference-error" className="aiError" role="alert">
                            {fileError}
                          </small>
                        )}
                      </div>
                    )
                  )}
                  <label className="aiField" htmlFor="ai-instructions">
                    <span>
                      补充说明 <span className="aiOptional">（选填）</span>
                    </span>
                    <textarea
                      id="ai-instructions"
                      value={instructions}
                      onChange={(event) => setInstructions(event.target.value)}
                      maxLength={1000}
                      rows={4}
                      placeholder="描述你想要的画面细节…"
                    />
                    <small className="aiCount">{instructions.length} / 1000</small>
                  </label>
                </div>
              )}
            </fieldset>
            <div className="aiSubmit">
              <p>生成时图片会发送至所选服务，调用可能产生费用。</p>
              <Button
                type="submit"
                disabled={
                  generating ||
                  !template ||
                  template.referenceImageCount > 2 ||
                  !modelId ||
                  !models.length ||
                  !!fileError ||
                  references.length !== template.referenceImageCount
                }
              >
                {generating ? "正在生成…" : "生成图片 ↗"}
              </Button>
              {generating && <span role="status">正在生成，请稍候，不要重复提交。</span>}
              {requestError && (
                <p className="aiError" role="alert">
                  {requestError}
                </p>
              )}
            </div>
          </form>
          <section className="aiResult" aria-labelledby="ai-result-heading">
            <div className="aiResultHead">
              <div>
                <span>OUTPUT / 01</span>
                <h2 id="ai-result-heading">生成结果</h2>
              </div>
              <span className="aiResultMark">✳</span>
            </div>
            <div className={`aiCanvas ${resultUrl ? "hasImage" : ""}`}>
              {resultUrl ? (
                <img src={resultUrl} alt="本次生成的图片" />
              ) : (
                <div className="aiEmpty">
                  <span>✳</span>
                  <p>画面将在这里呈现</p>
                  <small>选择模板，开始创作</small>
                </div>
              )}
            </div>
            <div className="aiResultFoot">
              <p>
                图片不会自动保存或发布。
                <br />
                满意的作品请下载到本地。
              </p>
              {resultUrl && (
                <a className="aiDownload" href={resultUrl} download={`ai-image.${extension}`}>
                  下载图片 ↓
                </a>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export function AiImagesPage() {
  return <ImageWorkspace />;
}
