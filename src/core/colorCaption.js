"use strict";
// Japanese and English caption recognition for ORIGINAL Rakuten product images.
// A color word alone is not proof of a variation. It must be an isolated short
// caption and must be corroborated by neighboring images/section evidence.
const enColors = [
    "black","white","gray","grey","blue","green","red","pink","purple","yellow",
    "beige","brown","navy","orange","silver","gold","ivory","khaki","cream",
    "mint","lavender","ecru","linen","platinum","volcan","zanzibar","canyon",
    "nude","blush","ice","gum","burgundy","indigo","scarlet","royal blue",
    "forest green","sapphire","pearl","ash","taupe","natural","stone",
    "olive","sage","slate","steel","oatmeal","chocolate","coral","bronze",
    "charcoal","off white","off-white","camel","sand","mustard","wine",
    "terracotta","turquoise","teal","coffee","mocha","ivory white","dark gray",
    "light gray","light blue","dark blue","sky blue","rose","greige","anthracite"
];
const jpColors = [
    "ブラック","ホワイト","グレー","グレイ","ブルー","グリーン","レッド","ピンク",
    "パープル","イエロー","ベージュ","ブラウン","ネイビー","オレンジ",
    "シルバー","ゴールド","アイボリー","カーキ","クリーム","ミント",
    "ラベンダー","エクリュ","リネン","プラチナ","ヌード","ブラッシュ",
    "アイス","ガム","バーガンディー","バーガンディ","インディゴ",
    "スカーレット","オリーブ","ナチュラル","モカ","グレージュ",
    "チャコール","ライトグレー","ダークグレー","オフホワイト",
    "ターコイズ","ボルドー","キャメル","サンド","コアブラック",
    "フットウェアホワイト","ロイヤルブルー","アッシュ","マスタード",
    "ネイビーブルー","ブラックグレー","グレーシックス","グレイシックス",
    "生成り","生成","白","黒","赤","青","緑","黄","灰色","茶色"
];
const en = [...new Set(enColors)].sort((a,b)=>b.length-a.length);
const jp = [...new Set(jpColors)].sort((a,b)=>b.length-a.length);
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const enRegexes=en.map(s=>new RegExp(`(^|[^a-z])(${reEsc(s).replace(/\\ /g,"[\\s-]+")})(?=$|[^a-z])`,"gi"));
const DETAIL_WORDS = /(?:\b(?:details?|feature|features|fabric|material|materials|dimensions?|measurement|storage|pockets?|zipper|lining|waterproof|handle|height|width|weight|length|capacity|washable|specification|stitching|interior|exterior|function|composition|polyester|cotton|thickness|stretch|sizes?|instructions|shoe|towel|product|using|usage|close[- ]?up|zoom|sole|outsole|insole|back|front|side|detail|structure|seams?|laces?|heel|toe)\b|素材|寸法|機能|特徴|収納|ポケット|重量|使い方|仕様|詳細|生地|ファスナー|縫製|洗濯|サイズ|ディテール|サイズ感|拡大|正面|背面|裏面|側面|底面|構造|着用|縫い目)/i;
const DETAIL_HEAD = /^(?:details?|product details?|features?|specifications?|商品詳細|製品詳細|ディテール|ディテールズ|仕様|特徴|素材)$/i;
const UNIT = /\d+(?:\.\d+)?\s*(?:mm|cm|kg|ml|inch(?:es)?|枚|個|センチ|ミリ|％|%)(?:\b|$)/i;
const PROSE = /(?:\b(?:with|made|of|and|for|has|inside|outside|using|designed|these|the|your|to|from)\b|です|ます|ので|という|つき|について|のため|できます)/i;
const LATIN_MODIFIERS = /\b(?:core|footwear|cloud|royal|night|light|dark|pale|deep|soft|bright|muted|vintage|off|pure|warm|cool|classic|no|original|collegiate|victory|power)\b/gi;
const JP_MODIFIERS = /(?:コア|フットウェア|クラウド|ロイヤル|ナイト|ライト|ダーク|オフ|パステル|ピュア|ヴィンテージ|パワー|アッシュ|カレッジエイト|ビクトリー)/g;

function normalizeText(text) {
    return String(text ?? "").normalize("NFKC").replace(/[\u200b-\u200d\ufeff]/g,"")
        .replace(/[✕✖ｘＸ]/g,"×").replace(/\s+[xX]\s+/g," × ")
        .replace(/[／∕⁄]/g,"/").replace(/\u3000/g," ").replace(/\s+/g," ").trim();
}
function parseColorCaption(value){
    const original=normalizeText(value);
    const empty={isLabel:false,kind:"",key:"",names:[],number:"",reason:""};
    if(!original||original.length>95||DETAIL_WORDS.test(original)||UNIT.test(original)||PROSE.test(original)||DETAIL_HEAD.test(original))return empty;
    let s=original.replace(/^[\s•●○■□・*]+/,"")
        .replace(/^(?:colou?r(?:\s+(?:name|variation))?|カラー名|色名|カラー|色)\s*[:：]\s*/i,"");
    let number="";
    const match=/^(\d{1,4})(?:\s*[.．:：\-]\s*|\s+)(?=\S)(.+)$/.exec(s);
    if(match){number=match[1];s=match[2].trim();}
    s=s.replace(/^[「『【(\[]+|[」』】)\]]+$/g,"").trim();
    if(!s||s.length>68||/^[\d\s×/,+&.\-]+$/.test(s))return empty;
    const matches=[];
    for(const term of jp)if(s.includes(term))matches.push(term);
    for(let i=0;i<en.length;i++){
        enRegexes[i].lastIndex=0;
        if(enRegexes[i].test(s))matches.push(en[i]);
    }
    let remainder=s;
    for(const term of jp)remainder=remainder.split(term).join(" ");
    for(let i=0;i<en.length;i++)remainder=remainder.replace(enRegexes[i]," ");
    remainder=remainder.replace(JP_MODIFIERS," ").replace(LATIN_MODIFIERS," ")
        .replace(/(?:colou?r|カラー|色|no\.?|番号)/gi," ");
    remainder=remainder.replace(/[\s\d×/,&+._:：()「」『』【】\[\]#・･、，|\-]/g,"");
    let kind="";
    if(matches.length && !remainder)kind="known-color";
    // Numbered fashion colors frequently combine a known color with a
    // brand-specific shade (e.g. 7. シルバードーン/ホワイト). Unknown short shade
    // components in a numbered multi-color label are acceptable, but a
    // feature/specification word is rejected above by DETAIL_WORDS/UNIT.
    else if(number && matches.length && /[×/,+&]/.test(s) &&
        s.split(/[×/,+&]/).every(part=>part.trim().length>=2 && part.trim().length<=30 &&
            /^[\p{Script=Han}\p{Script=Katakana}\p{Script=Hiragana}ーa-z\d\s.・\-]+$/iu.test(part.trim())))
        kind="coded-mixed-colors";
    else if(number&&!matches.length&&/^[a-z][a-z\s\-]{1,28}$/i.test(s))kind="coded-name";
    else if(number&&!matches.length&&/^[\p{Script=Katakana}\p{Script=Han}\s・\-]{2,24}$/u.test(s))kind="coded-name";
    if(!kind)return empty;
    const key=s.toLowerCase().replace(/[\s_.:：\-]+/g,"");
    return {isLabel:true,kind,key,names:matches.length?[...new Set(matches)]:[s],number,
        reason:kind==="coded-name"?"Short numbered product color caption":"Isolated color name or color combination"};
}
function analyzeOcrText(text){
    const lines=String(text??"").normalize("NFKC").split(/\r?\n|\u2022/).map(normalizeText).filter(Boolean);
    const parsed=lines.map(parseColorCaption).filter(v=>v.isLabel);
    const labels=[...new Map(parsed.map(v=>[v.key,v])).values()];
    // A short word like "MATERIAL" or "BACK" still identifies a detail
    // graphic. Do not require 16+ characters to recognize those headings.
    // Avoid treating a real color-caption line as an incidental detail line.
    const detailLines=lines.filter(x=>!parseColorCaption(x).isLabel &&
        (x.length>85||DETAIL_WORDS.test(x)||UNIT.test(x)||PROSE.test(x)));
    const heading=lines.some(x=>DETAIL_HEAD.test(x));
    return {labels,hasLabel:labels.length>0,hasDetailsHeading:heading,
        hasDescription:detailLines.length>=1,descriptionLines:detailLines.length,
        hasDetailSignal:heading||detailLines.length>=1,
        shortCaptions:labels.map(x=>x.key),readableLines:lines.length};
}
module.exports={normalizeText,parseColorCaption,analyzeOcrText,DETAIL_HEAD};
