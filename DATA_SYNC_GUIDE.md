# データ同期設定ガイド（社員側と人事側の連携）

## 問題

社員側（localhost:4200）から送信した「人事相談」のデータが、人事ダッシュボード（localhost:35345）に表示されない。

## 原因分析

1. **ポート間の localStorage 分離** - ブラウザセキュリティにより、異なるポート間で localStorage は共有されない
2. **API サーバーの統一不足** - フロントエンドが複数のバックエンドインスタンスと通信していた可能性
3. **CORS 設定の不十分さ** - 複数ポートからのリクエストが正しく許可されていなかった
4. **認証トークンの管理** - ポート間でトークンが異なる可能性

## 実装した改善

### 1. ApiService（src/app/services/api.service.ts）

**改善内容：**
- constructor を追加して、API URL を動的に取得可能に
- `getConfiguredApiUrl()` メソッドを追加してデバッグ支援
- consultation 関連メソッドに `tap` と `catchError` を追加
- 詳細なログ出力でトラブルシューティング支援

**効果：**
- API URL が統一され、両ポートから同じバックエンドにアクセス
- エラーが詳細にログ出力される

### 2. バックエンド CORS 設定（backend/src/server.ts）

**改善内容：**
```javascript
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
```

**効果：**
- localhost の全ポートからリクエストを許可
- 本番環境では具体的なドメインを指定可能

### 3. コンサルテーション API ログ追加

**Employee Route（backend/src/routes/employee.ts）:**
- 相談受信時にログ出力
- 従業員情報マッチング時にログ出力
- 相談保存時にログ出力

**Admin Route（backend/src/routes/admin.ts）:**
- 相談取得要求時にログ出力
- 取得結果の集計情報をログ出力

**効果：**
- API 層でのデータフローが可視化される
- 問題が発生した際に原因特定が容易

### 4. フロントエンド ログ強化

**MyPage Component（src/app/components/my-page/my-page.component.ts）:**
- 送信時に詳細情報をコンソール出力
- エラー時に詳細な情報を記録

**AdminDashboard Component（src/app/components/admin-dashboard/admin-dashboard.component.ts）:**
- 読み込み時に API URL を確認
- 読み込み結果の件数をログ出力
- エラー詳細をログ出力

**効果：**
- ブラウザのコンソールから完全なリクエスト/レスポンスフロー確認可能

## テスト手順

### 1. バックエンド起動確認

```bash
cd backend
npm run dev
# または
pnpm dev
```

出力例：
```
Server running on port 3000
```

### 2. フロントエンド起動（2つのターミナルで実行）

**ターミナル 1：**
```bash
ng serve --port 4200
```

**ターミナル 2：**
```bash
ng serve --port 35345
```

### 3. API 接続確認

```bash
# バックエンドヘルスチェック
curl http://localhost:3000/health

# 出力例：
# {"status":"ok"}
```

### 4. CORS テスト

```bash
# ポート 4200 から
curl -i -H "Origin: http://localhost:4200" \
  http://localhost:3000/api/consultations

# ポート 35345 から
curl -i -H "Origin: http://localhost:35345" \
  http://localhost:3000/api/consultations
```

両方で以下ヘッダーが返されるべき：
```
Access-Control-Allow-Origin: http://localhost:4200
Access-Control-Allow-Credentials: true
```

### 5. データ同期テスト

1. **ブラウザを2つ開く：**
   - ブラウザ A: http://localhost:4200 (社員ログイン)
   - ブラウザ B: http://localhost:35345 (人事ログイン)

2. **ブラウザ A（社員側）:**
   - マイページ → 人事相談フォーム
   - 相談内容を入力して送信
   - ブラウザコンソールで以下ログを確認：
     ```
     [MyPage] Submitting consultation: {
       userId: "...",
       descriptionLength: XX,
       timestamp: "...",
       apiUrl: "http://localhost:3000/api"
     }
     [MyPage] Consultation submitted successfully
     ```

3. **バックエンド ログ確認：**
   - ターミナルで以下ログが表示されるべき：
     ```
     [Consultation API] Received submission: {
       employeeId: "...",
       inquiryLength: XX,
       userId: "...",
       timestamp: "..."
     }
     [Consultation API] Consultation created: {
       id: "...",
       employeeId: "...",
       status: "pending",
       createdAt: "..."
     }
     ```

4. **ブラウザ B（人事側）：**
   - ダッシュボード → HR管理 → 人事相談
   - 一覧に相談が表示されるか確認
   - ブラウザコンソールで以下ログを確認：
     ```
     [AdminDashboard] Loading consultations...
     [AdminDashboard] API URL: http://localhost:3000/api
     [AdminDashboard] Consultations loaded: N items
     ```

## トラブルシューティング

### 症状 1: 「相談が送信されない」

**確認事項：**
1. バックエンドが起動しているか
   ```bash
   curl http://localhost:3000/health
   ```

2. ブラウザコンソールのエラーメッセージ
   - "CORS not allowed" → バックエンド CORS 設定確認
   - "401 Unauthorized" → 認証トークン確認
   - "404 Not Found" → API URL または ユーザー ID 確認

3. バックエンドログ確認
   - "[Consultation API] Received submission" が表示されるか

### 症状 2: 「相談は送信されたが、人事側に表示されない」

**確認事項：**
1. データベース確認
   ```bash
   # Prisma Studio で確認
   cd backend
   pnpm prisma:studio
   ```

2. API エンドポイント確認
   - 社員側: `/api/employees/{userId}/consultation` (POST)
   - 人事側: `/api/admin/consultations` (GET)

3. ユーザー権限確認
   - 人事側ユーザーが HR または ADMIN ロールか確認

4. バックエンドログで取得時のエラー確認
   - "[Admin Consultations API] Error" が表示されるか

### 症状 3: 「CORS エラーが発生」

**解決方法：**
1. バックエンド CORS 設定確認（backend/src/server.ts）
2. Origin ヘッダーが localhost かどうか確認
3. バックエンド再起動

### 症状 4: 「認証エラー（401）が発生」

**確認事項：**
1. ログイン状態確認
   - localStorage に auth_token が保存されているか
   - ブラウザコンソール：`localStorage.getItem('auth_token')`

2. トークン有効期限
   - 古いトークンは無効かもしれません
   - ログアウト → ログイン で再取得

3. ユーザーロール確認
   - 社員側: EMPLOYEE ロール
   - 人事側: HR または ADMIN ロール

## ログレベルと出力例

### レベル 1: 基本的なフロー確認

```
[MyPage] Submitting consultation: {...}
[ApiService] Submitting consultation for user ... to: http://localhost:3000/api/employees/.../consultation
[Consultation API] Received submission: {...}
[Consultation API] Consultation created: {...}
[ApiService] Consultation submitted successfully: {...}
[MyPage] Consultation submitted successfully
```

### レベル 2: エラー診断

```
[ApiService] Failed to retrieve consultations: {
  status: 403,
  statusText: "Forbidden",
  url: "http://localhost:3000/api/admin/consultations",
  error: { error: "Admin access required" }
}
```

### レベル 3: ネットワーク診断

```
curl -v http://localhost:3000/api/admin/consultations \
  -H "Authorization: Bearer {token}" \
  -H "Origin: http://localhost:35345"
```

## 本番環境への対応

本番環境では以下の設定を変更してください：

### 1. 環境設定ファイル

**src/environments/environment.prod.ts:**
```typescript
export const environment = {
  production: true,
  apiUrl: 'https://api.example.com/api',
  apiBaseUrl: 'https://api.example.com'
};
```

### 2. バックエンド CORS 設定

**backend/src/server.ts:**
```javascript
const corsOptions = {
  origin: [
    'https://employee.example.com',
    'https://hr.example.com'
  ],
  credentials: true,
  // ... その他の設定
};
```

### 3. 環境変数の使用

**backend/.env:**
```
PORT=3000
DATABASE_URL="file:./prod.db"
CORS_ORIGIN=https://employee.example.com,https://hr.example.com
```

## パフォーマンスと最適化

### 1. ネットワーク

- API コールは最小限に（不必要な重複読み込み避ける）
- 前回の読み込み結果をキャッシュ（必要に応じて）

### 2. データベース

- consultation テーブルに index があるか確認
- 大量の相談がある場合はページネーション検討

### 3. キャッシング戦略

```typescript
// 1分ごとに自動更新
setInterval(() => this.loadConsultations(), 60000);

// または: ユーザーがタブを見えている間だけ更新
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    this.loadConsultations();
  }
});
```

## 関連ファイル一覧

| ファイル | 変更内容 |
|---------|--------|
| src/app/services/api.service.ts | constructor 追加、エラーハンドリング強化 |
| backend/src/server.ts | CORS 設定改善 |
| backend/src/routes/employee.ts | consultation 送信時ログ追加 |
| backend/src/routes/admin.ts | consultation 取得時ログ追加 |
| src/app/components/my-page/my-page.component.ts | 送信ログ強化 |
| src/app/components/admin-dashboard/admin-dashboard.component.ts | 読み込みログ強化 |

## 参考資料

- [Angular HttpClient](https://angular.io/guide/http)
- [Express CORS ミドルウェア](https://www.npmjs.com/package/cors)
- [Prisma データベース](https://www.prisma.io/)
- [ブラウザ localStorage](https://developer.mozilla.org/ja/docs/Web/API/Window/localStorage)

## 問い合わせ

問題が解決しない場合は、以下の情報を含めてレポートしてください：

1. ブラウザコンソールの完全なエラーメッセージ
2. バックエンドのコンソール出力
3. ネットワークタブの HTTP リクエスト/レスポンス
4. 再現手順
