 所有 TG API 调用
     │
     ▼
  enqueue(fn)  ←── 统一入口
     │
     ▼
  outboundQueue (Promise chain，严格串行)
     │
     ├── flushStatus()     状态窗口更新
     ├── sendMessage()     文本消息
     ├── sendKeyboard()    内联键盘
     ├── sendQuiz()        测验投票
     ├── sendForceReply()  强制回复
     ├── sendReplyKeyboard() 底部键盘
     ├── editMessage()     编辑消息
     ├── editKeyboard()    编辑键盘
     ├── sendDice()        骰子动画
     ├── react()           表情回应
     ├── pin()             置顶消息
     └── sendChatAction()  输入状态
     │
     ▼
  reply() ←── 最后执行，await outboundQueue 等队列排干
     │
     ├── hasSentContent == true → 跳过，只清理状态窗口
     └── hasSentContent == false → 发送 result.content
