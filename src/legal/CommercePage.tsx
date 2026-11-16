import { Page } from '../ui/Pages';
import { OPERATOR, operatorReady, type OperatorInfo } from './operator';

const NOT_SET = '（未設定）';

/** 特定商取引法に基づく表記. Written in Japanese because the law applies to services offered in Japan. */
export function CommercePage({ operator = OPERATOR }: { operator?: OperatorInfo }) {
  const val = (v: string) => v.trim() || NOT_SET;
  const rows: [string, string][] = [
    ['販売事業者', val(operator.businessName)],
    ['運営統括責任者', val(operator.representative)],
    ['所在地', val(operator.address)],
    ['電話番号', val(operator.phone)],
    ['メールアドレス', val(operator.email)],
    ['販売価格', 'ART SLIDE Premium：月額 200円（税込）'],
    ['商品代金以外の必要料金', 'なし（インターネット接続に必要な通信料はお客様のご負担となります）'],
    ['お支払い方法', 'クレジットカード等（決済代行：Stripe）'],
    ['お支払い時期', 'お申し込み時に初回のお支払いが発生し、以降は毎月、同じ日に自動で更新・請求されます'],
    ['サービスの提供時期', 'お支払いの完了後、ただちにご利用いただけます'],
    ['契約期間・自動更新', '1か月ごとの自動更新です。解約しない限り、翌月以降も更新されます'],
    ['解約（キャンセル）', 'サイト内「アカウント」の「サブスクリプションを管理」からいつでも解約できます。解約後も、お支払い済みの期間の終わりまでPremiumをご利用いただけます'],
    ['返金', 'デジタルサービスの性質上、お支払い済みの料金の返金や日割り計算は行いません。ただし、法令で認められる場合を除きます'],
    ['動作環境', '最新版の主要ブラウザ（Chrome / Safari / Edge / Firefox）。Googleアカウントが必要です'],
  ];
  return (
    <Page title="特定商取引法に基づく表記">
      {!operatorReady(operator) && (
        <p className="muted" data-testid="commerce-incomplete">運営者情報が未設定です。設定が完了するまで、有料プランの申し込みはできません。</p>
      )}
      <dl className="commerce" data-testid="commerce">
        {rows.map(([k, v]) => (
          <div key={k} className="commerce-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Page>
  );
}
