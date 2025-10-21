/*
  # 添加目标和成就系统表

  ## 简介
  为 iHiker 添加用户目标设置和成就系统，增强用户粘性和激励机制。

  ## 新增表结构

  ### 1. user_goals（用户目标表）
  - `id` (uuid, 主键) - 目标唯一标识
  - `user_id` (uuid, 外键) - 用户ID
  - `type` (text) - 目标类型：distance/time/frequency
  - `target` (numeric) - 目标值
  - `current` (numeric) - 当前进度
  - `period` (text) - 周期：daily/weekly/monthly
  - `created_at` (timestamptz) - 创建时间
  - `updated_at` (timestamptz) - 更新时间

  ### 2. user_achievements（用户成就表）
  - `id` (uuid, 主键) - 记录唯一标识
  - `user_id` (uuid, 外键) - 用户ID
  - `achievement_id` (text) - 成就ID
  - `unlocked_at` (timestamptz) - 解锁时间
  - `created_at` (timestamptz) - 创建时间

  ## 安全策略
  - 启用所有表的 RLS
  - 用户只能查看和管理自己的目标和成就

  ## 索引优化
  - 为查询字段创建索引
*/

-- 创建用户目标表
CREATE TABLE IF NOT EXISTS user_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('distance', 'time', 'frequency')),
  target numeric NOT NULL,
  current numeric DEFAULT 0,
  period text NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 创建用户成就表
CREATE TABLE IF NOT EXISTS user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  achievement_id text NOT NULL,
  unlocked_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_period ON user_goals(user_id, period);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);

-- 启用 RLS
ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- user_goals 表的 RLS 策略
CREATE POLICY "Users can view own goals"
  ON user_goals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals"
  ON user_goals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals"
  ON user_goals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals"
  ON user_goals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- user_achievements 表的 RLS 策略
CREATE POLICY "Users can view own achievements"
  ON user_achievements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own achievements"
  ON user_achievements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own achievements"
  ON user_achievements FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 为 user_goals 表添加自动更新时间触发器
CREATE TRIGGER update_user_goals_updated_at
  BEFORE UPDATE ON user_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();