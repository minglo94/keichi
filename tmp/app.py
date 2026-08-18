"""
app.py  —  口頭報價表填寫工具 (Flask local web app)

Usage:
    python app.py
Then open: http://localhost:5000
"""

import io
import os
import sys

# Reconfigure stdout to UTF-8 to prevent Chinese character print encoding crashes on Windows
sys.stdout.reconfigure(encoding='utf-8')

from flask import Flask, jsonify, render_template, request, send_file

from fill_quotation import fill_quotation
from ocr_extract import deps_available, extract_from_image

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20 MB upload limit


# ── Page ──────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('form.html', ocr_available=deps_available())


# ── Generate DOCX ─────────────────────────────────────────────────────────────

@app.route('/generate', methods=['POST'])
def generate():
    f = request.form

    def _list(key):
        return request.form.getlist(key)

    def _int_or(val, default=0):
        try:
            return int(val)
        except (ValueError, TypeError):
            return default

    def _float_or(val, default=0.0):
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    # Build items list
    item_names = _list('item_name')
    item_qtys = _list('item_qty')
    items = [
        {'name': item_names[i], 'qty': item_qtys[i]}
        for i in range(len(item_names))
        if item_names[i].strip()
    ]

    # Build supplier data
    def build_supplier(prefix):
        raw_prices = _list(f'{prefix}_price')
        prices = [_float_or(p) for p in raw_prices]
        return {
            'name': f.get(f'{prefix}_name', ''),
            'tel': f.get(f'{prefix}_tel', ''),
            'prices': prices,
            'total': _float_or(f.get(f'{prefix}_total', 0)),
        }

    recommended = f.get('recommended', 'A')

    data = {
        'quotation_date': f.get('quotation_date', ''),
        'quote_method': f.get('quote_method', 'phone'),
        'quote_method_other': f.get('quote_method_other', ''),
        'quotation_name': f.get('quotation_name', ''),
        'items': items,
        'supplier_a': build_supplier('supplier_a'),
        'supplier_b': build_supplier('supplier_b'),
        'recommended': recommended,
        'use_lower_price': f.get('price_type', 'lower') == 'lower',
        'higher_price_reason': f.get('higher_price_reason', ''),
        'fewer_suppliers_reason': f.get('fewer_suppliers_reason', ''),
        'item_category': f.get('item_category', 'consumable'),
        'category_other': f.get('category_other', ''),
        'department': f.get('department', ''),
        'purpose': f.get('purpose', ''),
        'delivery_date': f.get('delivery_date', ''),
        'funding_source': f.get('funding_source', ''),
        'requestor_name': f.get('requestor_name', ''),
        'requestor_rank': f.get('requestor_rank', ''),
        'requestor_date': f.get('requestor_date', ''),
        'dept_head_name': f.get('dept_head_name', ''),
        'dept_head_rank': f.get('dept_head_rank', ''),
        'dept_head_date': f.get('dept_head_date', ''),
        'approver_name': f.get('approver_name', ''),
        'approver_rank': f.get('approver_rank', ''),
        'approver_date': f.get('approver_date', ''),
    }

    try:
        out_path = fill_quotation(data)
    except Exception as e:
        return f'<h2>Error generating document</h2><pre>{e}</pre>', 500

    filename = os.path.basename(out_path)
    return send_file(
        out_path,
        as_attachment=True,
        download_name=filename,
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )


# ── OCR API ───────────────────────────────────────────────────────────────────

@app.route('/api/ocr', methods=['POST'])
def api_ocr():
    if not deps_available():
        return jsonify({'error': 'OCR dependencies not installed. Run: pip install anthropic python-dotenv'}), 503

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Empty filename'}), 400

    file_bytes = file.read()
    ct = (file.content_type or '').lower()

    # Normalise MIME type; fall back by file extension for browsers that
    # send generic 'application/octet-stream' for PDFs
    mime_map = {
        'image/jpeg': 'image/jpeg',
        'image/jpg': 'image/jpeg',
        'image/png': 'image/png',
        'image/webp': 'image/webp',
        'image/gif': 'image/gif',
        'application/pdf': 'application/pdf',
    }
    media_type = mime_map.get(ct)
    if media_type is None:
        # Guess from extension
        fname = (file.filename or '').lower()
        if fname.endswith('.pdf'):
            media_type = 'application/pdf'
        else:
            media_type = 'image/jpeg'  # safe default for images

    result = extract_from_image(file_bytes, media_type)
    return jsonify(result)


# ── Run ───────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print('口頭報價表填寫工具啟動中...')
    print('請在瀏覽器開啟: http://localhost:5000')
    app.run(debug=True, port=5000)
