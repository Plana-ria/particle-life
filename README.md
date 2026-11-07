# Particle Life Lab

ブラウザで動作するParticle Lifeの実験室。ルールごとにページを分離し、物理エンジンとUIを共有しています。

- トップ: https://plana-ria.github.io/particle-life/
- Classic: https://plana-ria.github.io/particle-life/rules/classic/
- RGB Collision: https://plana-ria.github.io/particle-life/rules/rgb-collision/

## 実装ルール

### Classic: rules/classic/
6種の固定色を使う比較用モデル。相互作用行列は非対称で時間変化せず、近距離の斥力と速度減衰があります。RGBの変化はありません。

### RGB Collision: rules/rgb-collision/
粒子ごとに整数RGBを保持します（初期値は各0〜3、64色）。相互作用の強度は、2粒子のRGB成分を組み合わせる固定の周期的・非線形関数から計算します。**同じRGBなら同じルール**で、相互作用関数そのものは変化しません。

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

### RGB相互作用の非線形化

以前の3×3双線形RGB相互作用は、白・黒の両方がそれぞれ同色に強い引力を持ち、2色の塊へ分離しやすい問題がありました。現在はR/G/B成分を交差させた4つの固定周期関数（sin/cos）を合成し、tanhで[-1,1]に制限しています。RGBは粒子の性質であり、ルールの関数そのものは時間で変化しません。近距離反発・運動減衰・衝突エネルギー閾値・RGB成分交換は変更していません。

周期関数の値はRGB段階数に応じて起動時にテーブル化し、粒子ペアの計算を高速化しています。白黒への特別な禁止ルールはありません。色の多様性や長期安定性はシミュレーションでの検証対象であり、特定の分布への収束が起こらない保証はありません。

## 収束原因の比較実験 (RGB Collision)

既存のRGB Collisionページから次を切り替えられます。

- RGB変化のON/OFF：衝突による色変化の寄与を切り分けます。
- 近距離斥力（初期0.63）：密集を抑制できるか検証します。
- 合力正規化：なし（従来通り）／近傍数の平方根で割る／近傍数で割る（平均）。近傍数は作用半径内の他粒子数です。引力と反発の両方を正規化します。

診断値：粒子あたり平均運動エネルギー（質量1）、作用半径内の近傍数（平均・最大）、速度上限に達している粒子の割合、直近のRGB変化回数/シミュレーション秒（60 step=1秒）。診断は約0.5秒間隔で更新され、ズームと独立です。

比較には同じSeed・粒子数・RGB段階数でのリセットを使用してください。物理パラメータの調整は進行中でも可能ですが、原因を検証するときはリセット後の条件を揃えることを推奨します。ここではエネルギー保存則は導入していません。結果の収束防止を保証する実装ではなく、原因を切り分けるための実験機能です。

## 物理計算の改良（2026-11-08）

RGB Collision版だけ、標準設定を次に変更しました。Classic版には影響しません。

- 合力は作用半径内の近傍数の平方根で正規化（初期値 sqrt）。
- 近距離反発は元の -repel*x（x=1-d/minDist）から、-repel*x*(1+1.5*x) に変更。十分近づいた場合に強く押し返す方式。線形方式への切替も可能。
- 衝突判定は各ステップの前後位置を結ぶ相対運動線分と衝突半径との交差で判定し、途中で接触領域を通過した場合も検出。
- RGB変化判定のエネルギーは接近方向の相対速度の射影 u=max(0,-v_rel・r_hat) を使い、E=u²/4で計算。横滑りやすれ違いを高エネルギー衝突と誤判定しません。
- 前後位置はトーラス境界の最短距離で扱います。1ステップで半画面以上の移動は想定していません。
- 接触中は再発火せず、再接近時は1.55倍の再武装距離を使用します。初めから接触していたペアでは変更しません。
- 従来条件の再現は「正規化なし」「近距離斥力：線形」です。ただし衝突検出は精度向上しているため、完全なビット単位の再現ではありません。

長時間ベンチマーク `tests/long-benchmark.mjs` は複数Seedで旧力学条件と改良力学条件を比較し、各時点の近傍粒子数・平均運動エネルギー・色数・RGB変更頻度・空間占有率を出力します。力学にエネルギー保存則を導入したわけではなく、長期収束の防止も保証しません。

## Classic 70,000 particle GPU backend

Classic page uses a new `shared/classic-app.js` entrypoint, separate from the RGB Collision app.
It offers automatic WebGPU, explicit WebGPU, and CPU fallback (safe limit: 3,000 particles).
Select 1,000 / 3,000 / 10,000 / 30,000 / 50,000 / 60,000 / 70,000 particles.

`shared/classic-gpu.js` runs three ordered GPU compute passes per physics step:
1. clear spatial cell heads,
2. build a GPU grid using `atomicExchange` linked lists,
3. compute each particle's *directed* RGB-independent Classic force from the 9 surrounding cells, then integrate velocity and toroidally wrapped position.

The grid ensures work scales with nearby particle density rather than searching all pairs across the entire world. Two GPU state buffers ping-pong, and rendering uses GPU instanced quads with no particle readback to the main thread. The shader reproduces the Classic force kernel, damping and speed cap. GPU float precision and non-associative summation order mean trajectories may differ numerically from the CPU version.

To maintain approximate density as particle count increases, world width and height scale with `sqrt(count/1000)`; the *world area* therefore scales linearly with the count. The viewport is independent, with "100%" showing the whole world; use zoom and drag to inspect. This is not the same experiment as placing 70,000 particles in the old 1,000-particle-sized arena. Performance in pathological dense clustering remains workload-dependent.

Browser compatibility: secure origin (GitHub Pages), WebGPU-supported browser/device, available GPU resources. If WebGPU is absent, the app limits CPU mode to 3,000 particles and informs the user. There is no guarantee of sustained 60Hz on any arbitrary device at 70,000 particles. The UI reports actual physics updates/s and frame rate. If a device cannot keep up, the simulation slows rather than building an unbounded GPU queue.

Files: `shared/classic-gpu.js`, `shared/classic-camera.js`, `shared/classic-app.js`, `tests/classic-gpu.test.mjs`.
RGB Collision uses the preexisting engine unchanged.
