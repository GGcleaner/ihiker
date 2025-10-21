/*
  # 创建徒步轨迹系统数据表

  ## 简介
  为 iHiker 智能徒步助手创建完整的数据库架构，支持用户轨迹记录、历史查询和数据分析。

  ## 新增表结构

  ### 1. hiking_tracks（徒步轨迹主表）
  - `id` (uuid, 主键) - 轨迹唯一标识
  - `user_id` (uuid, 外键) - 用户ID，关联到 auth.users
  - `name` (text) - 轨迹名称
  - `total_distance` (numeric) - 总距离（米）
  - `total_time` (integer) - 总用时（秒）
  - `avg_speed` (numeric) - 平均速度（米/秒）
  - `max_speed` (numeric) - 最大速度（米/秒）
  - `start_time` (timestamptz) - 开始时间
  - `end_time` (timestamptz) - 结束时间
  - `created_at` (timestamptz) - 创建时间
  - `updated_at` (timestamptz) - 更新时间

  ### 2. track_points（轨迹点表）
  - `id` (uuid, 主键) - 点唯一标识
  - `track_id` (uuid, 外键) - 关联到 hiking_tracks
  - `latitude` (numeric) - 纬度
  - `longitude` (numeric) - 经度
  - `altitude` (numeric, 可选) - 海拔（米）
  - `accuracy` (numeric, 可选) - 精度（米）
  - `speed` (numeric, 可选) - 当前速度（米/秒）
  - `timestamp` (timestamptz) - 记录时间
  - `sequence` (integer) - 点序号

  ## 安全策略
  - 启用所有表的 RLS
  - 用户只能查看和管理自己的轨迹数据
  - 认证用户可以创建新轨迹
  - 用户可以更新和删除自己的轨迹

  ## 索引优化
  - 为常用查询字段创建索引
  - 优化按时间和用户查询性能
*/

-- 创建徒步轨迹主表
CREATE TABLE IF NOT EXISTS hiking_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '未命名徒步',
  total_distance numeric DEFAULT 0,
  total_time integer DEFAULT 0,
  avg_speed numeric DEFAULT 0,
  max_speed numeric DEFAULT 0,
  start_time timestamptz DEFAULT now(),
  end_time timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 创建轨迹点表
CREATE TABLE IF NOT EXISTS track_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid REFERENCES hiking_tracks(id) ON DELETE CASCADE NOT NULL,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  altitude numeric,
  accuracy numeric,
  speed numeric,
  timestamp timestamptz DEFAULT now(),
  sequence integer NOT NULL
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_hiking_tracks_user_id ON hiking_tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_hiking_tracks_start_time ON hiking_tracks(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_track_points_track_id ON track_points(track_id);
CREATE INDEX IF NOT EXISTS idx_track_points_sequence ON track_points(track_id, sequence);

-- 启用 RLS
ALTER TABLE hiking_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_points ENABLE ROW LEVEL SECURITY;

-- hiking_tracks 表的 RLS 策略
CREATE POLICY "Users can view own tracks"
  ON hiking_tracks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tracks"
  ON hiking_tracks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tracks"
  ON hiking_tracks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tracks"
  ON hiking_tracks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- track_points 表的 RLS 策略
CREATE POLICY "Users can view own track points"
  ON track_points FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hiking_tracks
      WHERE hiking_tracks.id = track_points.track_id
      AND hiking_tracks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own track points"
  ON track_points FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hiking_tracks
      WHERE hiking_tracks.id = track_points.track_id
      AND hiking_tracks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own track points"
  ON track_points FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hiking_tracks
      WHERE hiking_tracks.id = track_points.track_id
      AND hiking_tracks.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hiking_tracks
      WHERE hiking_tracks.id = track_points.track_id
      AND hiking_tracks.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own track points"
  ON track_points FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hiking_tracks
      WHERE hiking_tracks.id = track_points.track_id
      AND hiking_tracks.user_id = auth.uid()
    )
  );

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为 hiking_tracks 表添加自动更新时间触发器
CREATE TRIGGER update_hiking_tracks_updated_at
  BEFORE UPDATE ON hiking_tracks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();