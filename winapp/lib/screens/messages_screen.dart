import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/dm.dart';
import '../state/dm_controller.dart';
import '../theme/vellin_theme.dart';
import '../widgets/common.dart';

/// Раздел «Сообщения»: слева список диалогов, справа активный чат (two-pane).
class MessagesScreen extends StatelessWidget {
  const MessagesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final dm = context.watch<DmController>();
    return Scaffold(
      backgroundColor: VellinColors.bg0,
      body: Row(children: [
        SizedBox(width: 300, child: _ConversationList(dm: dm)),
        const VerticalDivider(width: 1, thickness: 1, color: VellinColors.line2),
        Expanded(child: dm.activePeerPublicId == null ? const _EmptyChat() : _ChatPane(dm: dm)),
      ]),
    );
  }
}

class _ConversationList extends StatelessWidget {
  final DmController dm;
  const _ConversationList({required this.dm});

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      const Padding(
        padding: EdgeInsets.fromLTRB(20, 24, 20, 12),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text('Сообщения',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: VellinColors.text0, letterSpacing: -0.5)),
        ),
      ),
      Expanded(
        child: dm.loadingConversations && dm.conversations.isEmpty
            ? const Center(child: CircularProgressIndicator(color: VellinColors.accentHi))
            : dm.conversations.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(20),
                    child: Center(
                      child: Text('Нет диалогов. Напишите другу из вкладки «Друзья».',
                          textAlign: TextAlign.center, style: TextStyle(color: VellinColors.text3, fontSize: 14)),
                    ),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    itemCount: dm.conversations.length,
                    itemBuilder: (_, i) => _ConversationTile(c: dm.conversations[i], dm: dm),
                  ),
      ),
    ]);
  }
}

class _ConversationTile extends StatelessWidget {
  final DmConversation c;
  final DmController dm;
  const _ConversationTile({required this.c, required this.dm});

  @override
  Widget build(BuildContext context) {
    final active = c.peer.publicId == dm.activePeerPublicId;
    return Material(
      color: active ? VellinColors.bg3 : Colors.transparent,
      borderRadius: BorderRadius.circular(VellinRadius.md),
      child: InkWell(
        borderRadius: BorderRadius.circular(VellinRadius.md),
        onTap: () => dm.openThread(c.peer.publicId),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          child: Row(children: [
            VellinAvatar(username: c.peer.username, avatarSeed: c.peer.avatarSeed, avatarUrl: c.peer.avatarUrl, size: 42, online: c.online),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(c.peer.username,
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: VellinColors.text0, fontSize: 14.5, fontWeight: FontWeight.w600)),
                if (c.lastBody != null)
                  Text(c.lastBody!,
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: VellinColors.text2, fontSize: 13)),
              ]),
            ),
            if (c.unreadCount > 0) ...[
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(color: VellinColors.accent, borderRadius: BorderRadius.circular(999)),
                child: Text('${c.unreadCount}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
              ),
            ],
          ]),
        ),
      ),
    );
  }
}

class _EmptyChat extends StatelessWidget {
  const _EmptyChat();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text('Выберите диалог', style: TextStyle(color: VellinColors.text3, fontSize: 15)),
    );
  }
}

class _ChatPane extends StatefulWidget {
  final DmController dm;
  const _ChatPane({required this.dm});
  @override
  State<_ChatPane> createState() => _ChatPaneState();
}

class _ChatPaneState extends State<_ChatPane> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  int _lastCount = 0;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send() {
    final text = _input.text;
    if (text.trim().isEmpty) return;
    widget.dm.sendText(text);
    _input.clear();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  Widget build(BuildContext context) {
    final dm = widget.dm;
    final msgs = dm.activeMessages;
    if (msgs.length != _lastCount) {
      _lastCount = msgs.length;
      _scrollToBottom();
    }
    final peerName = dm.conversations
        .cast<DmConversation?>()
        .firstWhere((c) => c?.peer.publicId == dm.activePeerPublicId, orElse: () => null)
        ?.peer
        .username;

    return Column(children: [
      // Заголовок собеседника.
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: VellinColors.line2))),
        alignment: Alignment.centerLeft,
        child: Text(peerName ?? 'Диалог',
            style: const TextStyle(color: VellinColors.text0, fontSize: 16, fontWeight: FontWeight.w600)),
      ),
      Expanded(
        child: dm.threadLoading
            ? const Center(child: CircularProgressIndicator(color: VellinColors.accentHi))
            : ListView.builder(
                controller: _scroll,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                itemCount: msgs.length,
                itemBuilder: (_, i) => _Bubble(m: msgs[i], mine: msgs[i].senderId == dm.myUserId),
              ),
      ),
      _Composer(controller: _input, onSend: _send),
    ]);
  }
}

class _Bubble extends StatelessWidget {
  final DirectMessage m;
  final bool mine;
  const _Bubble({required this.m, required this.mine});

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        constraints: const BoxConstraints(maxWidth: 440),
        decoration: BoxDecoration(
          color: mine ? VellinColors.accent : VellinColors.bg2,
          borderRadius: BorderRadius.circular(VellinRadius.lg),
        ),
        child: Text(
          m.previewText,
          style: TextStyle(color: mine ? Colors.white : VellinColors.text0, fontSize: 14.5, height: 1.35),
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback onSend;
  const _Composer({required this.controller, required this.onSend});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
      decoration: const BoxDecoration(border: Border(top: BorderSide(color: VellinColors.line2))),
      child: Row(children: [
        Expanded(
          child: TextField(
            controller: controller,
            onSubmitted: (_) => onSend(),
            textInputAction: TextInputAction.send,
            style: const TextStyle(color: VellinColors.text0, fontSize: 15),
            decoration: InputDecoration(
              hintText: 'Сообщение…',
              hintStyle: const TextStyle(color: VellinColors.text3),
              filled: true,
              fillColor: VellinColors.bg2,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(VellinRadius.md),
                borderSide: const BorderSide(color: VellinColors.line2),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(VellinRadius.md),
                borderSide: const BorderSide(color: VellinColors.accentHi),
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        IconButton.filled(
          onPressed: onSend,
          style: IconButton.styleFrom(backgroundColor: VellinColors.accent),
          icon: const Icon(Icons.send, color: Colors.white, size: 20),
        ),
      ]),
    );
  }
}
