#!/bin/bash

# 源目录（当前开发目录）
SOURCE_DIR="/Users/chouchangdong/code/obsidian/zettelkasten_plugin"

# 目标目录（Obsidian 插件目录）
TARGET_DIR="/Users/chouchangdong/百度Sync/笔记/AntinetTest/.obsidian/plugins/zettelkasten-plugin"

# 确保目标目录存在
mkdir -p "$TARGET_DIR"

# 需要同步的文件列表
FILES=(
    "main.js"
    "manifest.json"
    "styles.css"
)

# 同步文件
for file in "${FILES[@]}"; do
    if [ -f "$SOURCE_DIR/$file" ]; then
        echo "正在同步: $file"
        cp "$SOURCE_DIR/$file" "$TARGET_DIR/$file"
    else
        echo "警告: $file 不存在于源目录"
    fi
done

echo "同步完成！"
echo "请重启 Obsidian 或重新加载插件以应用更改。" 