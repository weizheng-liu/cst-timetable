# 日本大学理工学部 シラバスサイト調査メモ

調査日: 2026-11-27 ／ 対象: 2026年度シラバス

## 入口

| URL | 内容 |
|---|---|
| `https://www.cst.nihon-u.ac.jp/syllabus/` | 静的な案内ページ。最新年度へのリンクだけがある |
| `https://www.kyoumu.cst.nihon-u.ac.jp/syllabus/Publication/2026/index/1/` | 上のリンク先。下の Next.js アプリへリダイレクト |
| `https://www.kyoumu.cst.nihon-u.ac.jp/syllabus/page/Publication/index/?setiNendo=2026&gakubu=1` | 学科一覧（公開・ログイン不要） |

ページ本体は **Next.js のクライアントレンダリング**で、HTML にはデータがほぼ含まれない。
ブラウザの通信を見ると、画面は次の **公開 JSON API** からデータを取得している（ログイン不要、Cookie 不要）。

## JSON API

| エンドポイント | 用途 |
|---|---|
| `GET /syllabus/View/Initialize` | 学部・学科マスタなど |
| `GET /syllabus/View/Index?setiNendo={年度}&gakubu=1&gakka={学科}` | 学科の科目一覧（シラバス本文の大半を含む） |
| `GET /syllabus/View/Course?setiNendo={年度}&gakubu=1&jikanwariCD={時間割CD}&pageID={pageID}&flag=` | 1 科目の詳細。**授業計画（各回の日付・内容・対面/オンデマンド）**、教科書、オフィスアワー |
| `GET /syllabus/View/Table?setiNendo={年度}&gakubu=1F|1S&gakka={学科}` | 時間割表ビュー（船橋 1F / 駿河台 1S）。今回は未使用 |

HTML を解析するより、この JSON を使う方が壊れにくく、サーバー負荷も小さいため **JSON API を採用**した。
（そのため「HTML サンプルの fixture」の代わりに、実際の API レスポンスを `tests/fixtures/*.json` に保存してテストしている。）

`robots.txt` は存在しない（404）。ログインが必要なページ（履修登録システム等）には一切アクセスしない。
スクレイパーは `/syllabus/View/` 以下以外の URL を拒否する実装にしてある。

## 学科コード (`gakka`)

| コード | 学科 | | コード | 学科 |
|---|---|---|---|---|
| 01 | 土木工学科 | | 08 | 電気工学科 |
| 02 | 交通システム工学科 | | 09 | **電子工学科** |
| 03 | 建築学科 | | 15 | 応用情報工学科 |
| 04 | 海洋建築工学科 | | 10 | 物質応用化学科 |
| 14 | まちづくり工学科 | | 12 | 物理学科 |
| 05 | 機械工学科 | | 13 | 数学科 |
| 06 | 精密機械工学科 | | 99 | 教養教育・外国語・保健体育・共通基礎 |
| 07 | 航空宇宙工学科 | | CT / TT | 教職課程 / 学芸員課程 |

各学科の `Index` には、その学科の学生向けの共通科目（`syllabusSetiGakkaCD = 99`）も含まれる。

## 主なフィールドとコード表

`Index` の `gakkaData.syllabusData[]` の 1 要素 = シラバス 1 ページ:

| パス | 意味 | 値の例 / コード |
|---|---|---|
| `kamou.kamokuMei` | 科目名 | 回路理論Ⅰ |
| `kamou.kamokuCD` | 科目コード | 5109 |
| `kamou.taniSu` | 単位数 | 2 |
| `kamou.jugyouKbn` | 授業形態（推定） | K=講義, E=演習, J=実験・実習, Z=講義及び演習, G=卒業研究 |
| `jikwanaris[].jikanwariCD` | 時間割CD（年度内で一意） | J51A |
| `jikwanaris[].gakunen` | 設置学年 | 1〜4 |
| `jikwanaris[].youbiKbn` | 曜日 | 2=月 3=火 4=水 5=木 6=金 7=土 |
| `jikwanaris[].jigen` | 開始時限 | 1〜6 |
| `jikwanaris[].renzokuJigen` | 連続コマ数 | 2 → 「水曜1・2」 |
| `jikwanaris[].risyukiKbn` | 履修期 | 十の位: 1=年間, 2=前期, 3=後期（公式フロントと同じ判定） |
| `jikwanaris[].kousyaCD` | 校舎 | F=船橋, S=駿河台 |
| `jikwanaris[].kyousituNo` | 教室番号 | 1431 |
| `jikwanaris[].bikou` | 備考 | `{1}` `{2}`=クラス, `{再}`=再履修, `{未来}`=未来博士工房対応, `{共同開講}` |
| `page.evaluation` | 成績評価（自由記述） | 理解度確認テスト(45％)、中間試験(25％)… |
| `page.classFormat` | 授業形態 | 1=対面, 2=オンライン |
| `page.onlineMethod` | オンライン形式 | 1=同時双方向, 2=ハイフレックス, 3=オンデマンド |
| `page.comprehensionTest` | 理解度確認テストの有無 | 1=あり |

`Course` の `courseViewData.syllabusData.classScheduleData[].classSchedule`:

| フィールド | 意味 |
|---|---|
| `category` | 1=通常回, 2=オンデマンド回 |
| `displayIndex` | 回数 |
| `displaySubIndex` | 連続コマの何コマ目か（2 コマ続きの授業は 1 回が 2 行になっている → 1 件にまとめる） |
| `startDate` / `endDate` | 授業日（`YYYYMMDD`）。オンデマンドは視聴期間 |
| `isOnline` | 1=対面, 2=オンデマンド |
| `content` | 授業内容 |

理解度確認テスト（最終回）の日付が空のときは、`defaultScheduledDates` にある学部共通の予定日を使う（公式画面と同じ処理）。

## 時限

公式の時間割表に記載の時刻（100 分授業）:

| 時限 | 時刻 |
|---|---|
| 1 | 09:00〜10:40 |
| 2 | 10:50〜12:30 |
| 3 | 13:20〜15:00 |
| 4 | 15:10〜16:50 |
| 5 | 17:00〜18:40 |
| 6 | 18:50〜20:30 |

公式表は 6 限まで。7 限はデータに現れた場合だけ表示する（`docs/DECISIONS.md` 参照）。

## 休講情報

シラバスには **休講の情報がない**（各回に日付が入っているだけ）。休講・補講は教務課の掲示や
学内ポータルで告知され、それらはログインが必要なため取得しない。
アプリでは授業内容に「休講」と書かれた回だけを休講として扱う（.ics から除外）。

## 礼儀正しいアクセス

- リクエスト間隔は最低 1 秒（既定 1.2 秒）
- `.cache/syllabus/` にレスポンスをキャッシュ（24 時間）。GitHub Actions ではキャッシュを復元して再利用
- 失敗時は最大 3 回まで指数バックオフで再試行、4xx は再試行しない
- User-Agent にツール名とリポジトリ URL を明記
- 全学科の取得はおよそ 1,500〜2,000 リクエスト（約 40 分）。年 2 回だけ自動実行
