import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/friends_api.dart';
import '../models/social.dart';
import '../state/auth_controller.dart';
import '../theme/vellin_theme.dart';
import '../widgets/common.dart';
import 'public_profile_screen.dart';

/// Вкладка «Профиль»: собственный профиль в том же виде, что публичный
/// (карточка с аватаром, «О себе», факты, любимое кино). Отсюда — переход в
/// настройки профиля. Данные берём тем же эндпоинтом, что и чужой профиль
/// (relationship == 'self'), чтобы вид был идентичным.
class SelfProfileScreen extends StatefulWidget {
  const SelfProfileScreen({super.key});
  @override
  State<SelfProfileScreen> createState() => _SelfProfileScreenState();
}

class _SelfProfileScreenState extends State<SelfProfileScreen> {
  PublicProfile? _profile;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final me = context.read<AuthController>().user;
    if (me == null) return;
    try {
      final p = await context.read<FriendsApi>().profile(me.publicId);
      if (mounted) setState(() { _profile = p; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : 'Не удалось загрузить профиль');
    }
  }

  Future<void> _openSettings() async {
    await context.push('/settings');
    if (mounted) _load(); // подхватить изменения после редактирования
  }

  @override
  Widget build(BuildContext context) {
    // Перерисовываем шапку при смене аватара/имени в настройках.
    context.watch<AuthController>();
    return Scaffold(
      backgroundColor: VellinColors.bg0,
      appBar: AppBar(
        backgroundColor: VellinColors.bg0,
        elevation: 0,
        scrolledUnderElevation: 0,
        automaticallyImplyLeading: false,
        title: const Text('Мой профиль',
            style: TextStyle(color: VellinColors.text0, fontSize: 17, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined, color: VellinColors.text1),
            tooltip: 'Настройки профиля',
            onPressed: _openSettings,
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _error != null
          ? ProfileErrorState(_error!)
          : _profile == null
              ? const Center(child: CircularProgressIndicator(color: VellinColors.accentHi))
              : ProfileView(
                  profile: _profile!,
                  actions: PrimaryButton(
                    label: 'Настройки профиля',
                    secondary: true,
                    onPressed: _openSettings,
                  ),
                ),
    );
  }
}
