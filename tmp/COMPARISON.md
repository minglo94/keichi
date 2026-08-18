# KCquotation Python 腳本 vs keichi Next.js 版本比較

對比日期：2026-07-15
Python 版本：`tmp/fill_quotation.py` + `tmp/app.py`
Next.js 版本：`src/app/api/quotation/generate/route.ts`

---

## 主要差異發現

### 1. **批核人（Approver）欄位** ⚠️ **需要跟進**

**Python 版本（新增）：**
```python
# Lines 99-101, 393-400
'approver_name': data.get('approver_name', ''),
'approver_rank': data.get('approver_rank', ''),
'approver_date': data.get('approver_date') or today,

_fill_sig_row(
    lbl_p26,
    label_prefix="批核人",
    name=data.get('approver_name', ''),
    rank=data.get('approver_rank', ''),
    date=data.get('approver_date') or today,
    is_approver=True,  # 特殊處理：顯示 "校長/副校長"
)
```

**Next.js 版本（缺少）：**
- ❌ Schema 中沒有 `approverName`, `approverRank`, `approverDate`
- ❌ 沒有對應的模板欄位

**影響：**
- 報價表需要三級簽署：索取報價人 → 科組負責人 → **批核人（校長/副校長）**
- 目前 Next.js 版本只支援兩級簽署

---

### 2. **簽署行格式優化** ⚠️ **建議跟進**

**Python 版本（Lines 312-361）：**
- 使用 `_fill_sig_row()` 函數將簽署資訊壓縮成**單行**
- 格式：`索取報價人 姓名: XXX    職級: XXX    簽署:     日期: 2026-07-15`
- 保留原有字體格式（font_name, font_size, bold/italic）
- 標籤加粗，值不加粗（清晰對比）
- 自動清理下一行空白段落（`_clear_paragraph()`）

**Next.js 版本（docxtemplater）：**
- 使用模板變數 `{{requestorName}}`、`{{requestorRank}}` 等
- 依賴模板預設的多行佈局

**影響：**
- Python 版本的單行格式更緊湊專業
- docxtemplater 方法更簡單但格式控制較弱

---

### 3. **日期格式化** ⚠️ **建議跟進**

**Python 版本（Lines 199-216）：**
```python
# 將 YYYY-MM-DD 轉換為繁體中文格式
dt = datetime.strptime(q_date, '%Y-%m-%d')
date_str = f"  {dt.year} 年    {dt.month} 月  {dt.day}   日"
# 輸出：  2026 年    7 月  15   日
```

**Next.js 版本：**
```typescript
quotationDate: d.quotationDate,  // 直接使用原始字串
```

**影響：**
- Python 版本自動格式化為傳統中文日期，符合政府/學校正式文件標準
- Next.js 版本依賴前端傳入格式化好的字串

---

### 4. **數字格式化精度**

**Python 版本：**
```python
# 直接使用原始數字，不做格式化
str(supplier_data.get('total', ''))
```

**Next.js 版本（Lines 60-63）：**
```typescript
function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return ""
  return Number(n).toLocaleString("en-US", { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })
}
// 輸出：1,234.56
```

**差異：**
- Next.js 版本統一格式化為千分位 + 2位小數
- Python 版本保持原始輸入

---

### 5. **字體大小修復** ⚠️ **重要修復**

**Python 版本（Lines 336-341）：**
```python
# 如果字體太小或缺失，預設為 12pt
if font_size and font_size >= Pt(6):
    run.font.size = font_size
else:
    run.font.size = Pt(12)
```

**背景：**
- 修復模板中某些段落字體異常小的問題
- 確保生成文件的可讀性

**Next.js 版本：**
- docxtemplater 自動繼承模板字體
- 如果模板有問題，生成的文件也會有問題

---

### 6. **價格行數動態調整** ⚠️ **架構差異**

**Python 版本（Lines 74-90, 132-137）：**
```python
def _set_cell_lines(cell, lines):
    """動態新增或清空段落以匹配價格行數"""
    # 如果項目數超過現有段落，複製第一段的格式並新增
    if i >= len(paras):
        new_elem = deepcopy(paras[0]._element)
        cell._element.append(new_elem)
```

**Next.js 版本（Lines 112-113）：**
```typescript
supAPrices: supAPriceLines.join("\n"),  // 用換行符連接所有價格
```

**差異：**
- Python 版本精確控制表格每個價格為獨立段落（保持對齊）
- Next.js 版本依賴 `linebreaks: true` 將 `\n` 轉換為段落

---

## 需要跟進的項目

### 🔴 高優先級

1. **新增批核人欄位**
   - 更新 `generateSchema` 加入 `approverName`, `approverRank`, `approverDate`
   - 更新模板 `quotation.docx` 加入第三級簽署區塊
   - 更新前端表單加入批核人輸入欄位

2. **字體大小保護機制**
   - docxtemplater 無法直接控制，需檢查並修復模板本身
   - 確保模板所有文字 ≥ 10pt

### 🟡 中優先級

3. **日期自動格式化**
   - 在 API route 中加入日期轉換邏輯（YYYY-MM-DD → 中文格式）
   - 或在前端統一格式化後傳入

4. **簽署行單行壓縮**
   - 評估是否需要：docxtemplater 難以實現複雜格式控制
   - 替代方案：設計模板時直接使用單行佈局 + 多個變數

### 🟢 低優先級

5. **價格行數驗證**
   - 目前依賴 `linebreaks: true`，需測試 3 項目 × 不同價格數的對齊情況

---

## Python 版本的新增功能（keichi 不適用）

- **OneDrive 自動搜尋模板**（Lines 22-45）：本地 Flask app 特有功能
- **OCR 圖片提取**（`app.py` Lines 120-155）：keichi 已有獨立 `/api/quotation/ocr` 實現
- **Flask 表單渲染**：keichi 使用 React 前端

---

## 建議行動計劃

1. **立即執行**（修復遺漏功能）：
   - 新增批核人欄位到 schema、API、前端表單
   - 檢查並修復 `public/templates/quotation.docx` 字體大小

2. **短期執行**（提升格式品質）：
   - 加入日期自動格式化
   - 測試多項目價格行對齊

3. **長期考慮**（架構改進）：
   - 如果 docxtemplater 格式控制不足，考慮引入 `python-docx` 作為備選方案
   - 或使用混合方案：docxtemplater 填充 + python-docx 後處理

---

## 總結

Python 版本（KCquotation）新增了：
1. ✅ 批核人第三級簽署（**必須跟進**）
2. ✅ 字體大小保護（**應跟進，至少修復模板**）
3. ✅ 日期中文格式化（**建議跟進**）
4. ✅ 單行簽署格式（**可選，取決於需求**）

keichi 需要優先處理 #1 和 #2，以確保生成的報價表符合學校正式流程。
