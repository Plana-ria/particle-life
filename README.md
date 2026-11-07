# Particle Life Lab

ブラウザで動作するParticle Lifeの実験室。ルールごとにページを分離し、物理エンジンとUIを共有しています。

- トップ: https://plana-ria.github.io/particle-life/
- Classic: https://plana-ria.github.io/particle-life/rules/classic/
- RGB Collision: https://plana-ria.github.io/particle-life/rules/rgb-collision/

## 実装ルール

### Classic: rules/classic/
6種の固定色を使う比較用モデル。相互作用行列は非対称で時間変化せず、近距離の斥力と速度減衰があります。RGBの変化はありません。

### RGB Collision: rules/rgb-collision/
粒子ごとに整数RGBを保持します（初期値は各0〜3、64色）。相互作用の強度は、2粒子のRGBベクトルと固定3×3行列から動的に計算します。**同じRGBなら同じルール**で、相互作用関数そのものは変化しません。

粒子間距離が衝突半径の外から内へ入った場合に限り、接近方向の相対速度に基づく無次元エネルギー E = (max(0, (r_before - r_after) / Δt))² / 4 を計算します。閾値以上なら、2粒子のRGBに基づいて決定的に選ばれたR/G/Bの1成分を交換します。同じ2粒子が接触中は再反応しません。再反応するには衝突半径の1.55倍以上に離れる必要があります。

- 平均化ではなく成分交換なので、RGB各成分の粒子集団内の値の分布は保存されます。白への一方向の混色を避けられます。
- RGBの変化が引力・斥力の振る舞いへ即座に反映されます。
- 一度変化した色が別の遭遇で元に戻ることも可能です。
- RGB段階数は3 / 4 / 8 / 16から選べます。実際の表示は0〜255へスケーリングします。
- 特殊色の薄い発光は描画演出のみで、運動には影響しません。
- 時間刻みは固定60Hz、ブラウザの描画が遅いときは処理量を制限します。

※ 現段階の「衝突」は物理的な完全弾性衝突や接触剛体の計算ではなく、一定距離への進入イベントです。速度ベースのエネルギーはRGB変更の発生判定に用いるもので、運動エネルギーを実際に消費する処理はありません。境界はトーラス状で反対側につながっています。

## 構成

~~~text
index.html                  # ルール選択トップ
rules/
  classic/index.html        # Classicの独立ページ
  rgb-collision/index.html  # RGB衝突ルールの独立ページ
shared/
  engine.js                 # 共有物理エンジン・ルール関数
  app.js                    # 共有コントロール・描画ループ
  styles.css                # 共通スタイル
tests/
  engine.test.mjs           # 衝突/保存則/再現性などのテスト
.github/workflows/pages.yml # 自動テスト（デプロイはPages標準機能）
~~~

ルールを追加するときは rules/<slug>/index.html を追加し、必要な計算方式を shared/engine.js に追加します。各ルールは独立URLを持ちます。CSS/JSは相対パスを使っているので、GitHub Pagesのリポジトリ配信（/particle-life/）でも動作します。

## 実行・テスト

静的サイトなので依存パッケージは不要です。ES Moduleを読み込むため、ローカルサーバーで起動してください。

~~~sh
python3 -m http.server 8000
# http://localhost:8000/
node --test tests/*.test.mjs
~~~

## GitHub Pages

このリポジトリは **main ブランチの / (root)** をそのまま GitHub Pages で公開します。

1. リポジトリの Settings → Pages を開きます。
2. Build and deployment → Source で Deploy from a branch を選択します。
3. Branch を main、Folder を / (root) にして Save します。
4. 初回デプロイ完了後は上記URLで開けます。mainへのpushで自動更新されます。

.github/workflows/pages.yml はGitHub Actionsでテストだけを実行します。Pagesへの配信はGitHub Pagesの標準のブランチ配信機能を使います。

## 表示操作（全ルール共通）

カメラは表示専用で、ズームや移動によって粒子の位置・速度・衝突半径・相互作用は変化しません。倍率は50%〜800%。

- マウスホイール：マウス位置を中心に拡大・縮小
- 画面右上の「＋」「−」：中央を基準に倍率を変更
- 「100%」またはキーボードの「0」：標準表示に戻す
- 100%超で左ドラッグ：表示範囲を移動（パン）
- 右ドラッグ／中央ドラッグ：表示範囲を移動
- 通常倍率の左ドラッグ：従来どおり粒子に力を加える
- Shift＋左ドラッグ：拡大時でも粒子に力を加える
- タッチ操作：2本指でピンチ拡大縮小、拡大中は1本指で移動
- キーボードの「＋」「−」：中央を基準に拡大縮小

スクリーン上の操作は拡大率に応じてワールド座標へ変換されます。ズームを元に戻してもシミュレーションはリセットされません。カメラ計算は `shared/camera.js` に独立し、テストは `tests/camera.test.mjs` にあります。
