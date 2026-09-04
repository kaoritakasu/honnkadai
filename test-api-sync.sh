#!/bin/bash

# API Synchronization Test Script
# 社員側と人事側のデータ同期をテストするスクリプト

set -e

API_URL="http://localhost:3000/api"
HEALTH_URL="http://localhost:3000/health"

echo "================================"
echo "API データ同期テスト"
echo "================================"
echo ""

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Backend Health Check
echo -e "${YELLOW}[Test 1] バックエンド ヘルスチェック${NC}"
if curl -s "$HEALTH_URL" | grep -q "ok"; then
  echo -e "${GREEN}✓ バックエンドが起動しています${NC}"
else
  echo -e "${RED}✗ バックエンドが起動していません${NC}"
  echo "  実行: cd backend && npm run dev"
  exit 1
fi
echo ""

# Test 2: CORS Test for Port 4200
echo -e "${YELLOW}[Test 2] CORS テスト (Port 4200 - 社員側)${NC}"
CORS_RESPONSE=$(curl -s -i -H "Origin: http://localhost:4200" \
  "$API_URL/admin/consultations" 2>&1 | grep -i "access-control-allow-origin")

if [[ $CORS_RESPONSE == *"localhost"* ]] || [[ $CORS_RESPONSE == *"*"* ]]; then
  echo -e "${GREEN}✓ CORS が許可されています${NC}"
  echo "  Response: $CORS_RESPONSE"
else
  echo -e "${RED}✗ CORS がブロックされています${NC}"
  echo "  backend/src/server.ts の CORS 設定を確認してください"
fi
echo ""

# Test 3: CORS Test for Port 35345
echo -e "${YELLOW}[Test 3] CORS テスト (Port 35345 - 人事側)${NC}"
CORS_RESPONSE=$(curl -s -i -H "Origin: http://localhost:35345" \
  "$API_URL/admin/consultations" 2>&1 | grep -i "access-control-allow-origin")

if [[ $CORS_RESPONSE == *"localhost"* ]] || [[ $CORS_RESPONSE == *"*"* ]]; then
  echo -e "${GREEN}✓ CORS が許可されています${NC}"
  echo "  Response: $CORS_RESPONSE"
else
  echo -e "${RED}✗ CORS がブロックされています${NC}"
fi
echo ""

# Test 4: Database Connection
echo -e "${YELLOW}[Test 4] データベース接続確認${NC}"
if curl -s "$API_URL/admin/consultations" -H "Authorization: Bearer dummy" | grep -q "error\|data\|\[\]"; then
  echo -e "${GREEN}✓ データベースに接続できています${NC}"
else
  echo -e "${RED}✗ データベース接続エラー${NC}"
fi
echo ""

# Test 5: API Endpoints
echo -e "${YELLOW}[Test 5] API エンドポイント確認${NC}"
echo ""
echo "  社員側エンドポイント:"
echo "    - POST /api/employees/{userId}/consultation"
echo "      データ送信: { inquiry: \"相談内容\" }"
echo ""
echo "  人事側エンドポイント:"
echo "    - GET /api/admin/consultations"
echo "      全相談一覧取得（HR/ADMIN ロール必須）"
echo ""

# Test 6: Check Consultation Data
echo -e "${YELLOW}[Test 6] コンサルテーションデータ確認${NC}"
echo ""
echo "  Prisma Studio で確認:"
echo "    $ cd backend && pnpm prisma:studio"
echo ""

# Test 7: Frontend Port Check
echo -e "${YELLOW}[Test 7] フロントエンド ポート確認${NC}"
echo ""

PORTS=(4200 35345)
for PORT in "${PORTS[@]}"; do
  if timeout 2 bash -c "curl -s http://localhost:$PORT >/dev/null 2>&1"; then
    echo -e "  ${GREEN}✓ Port $PORT: フロントエンド起動中${NC}"
  else
    echo -e "  ${YELLOW}✗ Port $PORT: フロントエンド未起動${NC}"
    if [ $PORT -eq 4200 ]; then
      echo "      起動: ng serve --port 4200"
    else
      echo "      起動: ng serve --port $PORT"
    fi
  fi
done
echo ""

# Test 8: Console Logging Check
echo -e "${YELLOW}[Test 8] コンソールログ確認方法${NC}"
echo ""
echo "  ブラウザの開発者ツール (F12 または Ctrl+Shift+I) で以下を確認:"
echo ""
echo "  社員側（localhost:4200）からの送信:"
echo "    [MyPage] Submitting consultation:"
echo "    [ApiService] Submitting consultation for user..."
echo ""
echo "  バックエンド ログ:"
echo "    [Consultation API] Received submission:"
echo "    [Consultation API] Consultation created:"
echo ""
echo "  人事側（localhost:35345）での取得:"
echo "    [AdminDashboard] Loading consultations..."
echo "    [AdminDashboard] Consultations loaded: N items"
echo ""

# Summary
echo -e "${YELLOW}================================${NC}"
echo -e "${YELLOW}テスト完了${NC}"
echo -e "${YELLOW}================================${NC}"
echo ""
echo "手動テストの手順:"
echo ""
echo "1. ブラウザを2つ開く:"
echo "   - ブラウザ A: http://localhost:4200"
echo "   - ブラウザ B: http://localhost:35345"
echo ""
echo "2. ブラウザ A（社員側）でログイン"
echo "   - マイページ → 人事相談フォーム"
echo "   - 相談内容を入力して送信"
echo "   - F12 でコンソール確認"
echo ""
echo "3. ブラウザ B（人事側）でログイン"
echo "   - ダッシュボード → HR管理 → 人事相談"
echo "   - 送信した相談が表示されるか確認"
echo ""
echo "問題が発生した場合:"
echo "- DATA_SYNC_GUIDE.md を参照"
echo "- ブラウザコンソールとバックエンドログを確認"
echo ""
