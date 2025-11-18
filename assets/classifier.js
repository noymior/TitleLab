// assets/classifier.js

const classifierRules = {
  main_category: {
    亲子: ['宝宝', '带娃', '母女', '一家人', '家庭', '小朋友', '人类幼崽'],
    情侣: ['情侣', '恋爱', '求婚', '男朋友', '女朋友', '纪念日', 'cp', '告白'],
    闺蜜: ['闺蜜', '姐妹', '好朋友', '女生们'],
    单人: ['在逃公主', '生日写真', '一个人', '单人', '自己', '独自', 'solo'],
    街拍: ['街拍', '中环', '铜锣湾', '尖沙咀', '港风街拍'],
  },
  scene: {
    港迪城堡: ['城堡', '迪士尼', '港迪', '乐园'],
    烟花: ['烟花', 'fireworks', '焰火'],
    夜景: ['夜景', '夜拍', '夜幕', '灯光秀', '夜色'],
    香港街拍: ['街拍', '中环', '铜锣湾', '尖沙咀', '维港'],
  },
  content_type: {
    攻略: ['攻略', '姿势', '机位', '清单', '避坑', '指南', '秘籍'],
    展示: ['出片', '写真', '记录', '大片', '成片'],
    服务: ['摄影师', '女摄', '跟拍', '旅拍', '预约', '下单', '值不值'],
    节日: ['圣诞', '跨年', '万圣节', '元旦', '新年', '节日'],
  },
};

function classifyTitleText(text) {
  const result = {
    main_category: null,
    scene_tags: [],
    content_type: null,
    intent_tags: [],
  };

  const safeText = (text || '').toLowerCase();

  // 主分类
  for (const [cat, keys] of Object.entries(classifierRules.main_category)) {
    if (keys.some((k) => safeText.includes(k.toLowerCase()))) {
      result.main_category = cat;
      break;
    }
  }

  // 场景
  for (const [scene, keys] of Object.entries(classifierRules.scene)) {
    if (keys.some((k) => safeText.includes(k.toLowerCase()))) {
      result.scene_tags.push(scene);
    }
  }

  // 内容类型
  for (const [type, keys] of Object.entries(classifierRules.content_type)) {
    if (keys.some((k) => safeText.includes(k.toLowerCase()))) {
      result.content_type = type;
      break;
    }
  }

  // 营销目的（简单规则示例）
  if (safeText.includes('值不值') || safeText.includes('多少钱')) {
    result.intent_tags.push('价格/避坑');
  }
  if (safeText.includes('帮我选') || safeText.includes('你们觉得')) {
    result.intent_tags.push('互动评论');
  }
  if (safeText.includes('哭') || safeText.includes('感动')) {
    result.intent_tags.push('情绪故事');
  }

  return result;
}
