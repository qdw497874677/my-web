import { describe, expect, it } from "vitest";
import { fromShanghaiDateTimeLocal, toShanghaiDateTimeLocal } from "./shanghai-time";

describe("刊物时区", () => {
  it("把带 offset 的 ISO 时间显示为上海 datetime-local", () => {
    expect(toShanghaiDateTimeLocal("2026-08-01T00:30:00Z")).toBe("2026-08-01T08:30");
    expect(toShanghaiDateTimeLocal("2026-08-01T08:30:00+08:00")).toBe("2026-08-01T08:30");
  });

  it("把上海 datetime-local 明确提交为 +08:00 ISO", () => {
    expect(fromShanghaiDateTimeLocal("2026-08-01T08:30")).toBe("2026-08-01T08:30:00+08:00");
  });

  it("拒绝不存在的上海本地时间", () => {
    expect(() => fromShanghaiDateTimeLocal("2026-02-30T08:30")).toThrow("排期时间格式无效");
  });
});
