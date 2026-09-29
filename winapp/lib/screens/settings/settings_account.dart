import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../../api/auth_api.dart';
import '../../state/auth_controller.dart';
import '../../theme/vellin_design.dart';
import '../../widgets/ui/vellin_field.dart';
import '../../widgets/ui/vellin_surfaces.dart';
import 'save_button.dart';

/// «Аккаунт и пароль»: смена почты и пароля — оба действия подтверждаются
/// текущим паролем, поэтому живут рядом.
class SettingsAccount extends StatefulWidget {
  const SettingsAccount({super.key});

  @override
  State<SettingsAccount> createState() => _SettingsAccountState();
}

class _SettingsAccountState extends State<SettingsAccount> {
  final _email = TextEditingController();
  final _emailPassword = TextEditingController();
  SaveState _emailSave = SaveState.idle;
  String? _emailError;

  final _current = TextEditingController();
  final _next = TextEditingController();
  SaveState _passwordSave = SaveState.idle;
  String? _passwordError;

  @override
  void dispose() {
    _email.dispose();
    _emailPassword.dispose();
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  Future<void> _changeEmail() async {
    setState(() {
      _emailSave = SaveState.saving;
      _emailError = null;
    });
    try {
      final res = await context.read<AuthApi>().changeEmail(_email.text.trim(), _emailPassword.text);
      if (!mounted) return;
      await context.read<AuthController>().applyResult(res);
      if (!mounted) return;
      _email.clear();
      _emailPassword.clear();
      setState(() => _emailSave = SaveState.saved);
    } catch (e) {
      if (mounted) {
        setState(() {
          _emailSave = SaveState.idle;
          _emailError = 'Не удалось сменить почту: $e';
        });
      }
    }
  }

  Future<void> _changePassword() async {
    setState(() {
      _passwordSave = SaveState.saving;
      _passwordError = null;
    });
    try {
      final res = await context.read<AuthApi>().changePassword(_current.text, _next.text);
      if (!mounted) return;
      await context.read<AuthController>().applyResult(res);
      if (!mounted) return;
      _current.clear();
      _next.clear();
      setState(() => _passwordSave = SaveState.saved);
    } catch (e) {
      if (mounted) {
        setState(() {
          _passwordSave = SaveState.idle;
          _passwordError = 'Не удалось сменить пароль: $e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthController>().user;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        VellinCard(
          title: 'Почта',
          children: [
            Text(
              'Сейчас: ${user?.email ?? '—'}',
              style: VellinType.caption.copyWith(fontSize: 12.5),
            ),
            VellinField(
              label: 'Новая почта',
              controller: _email,
              placeholder: 'you@example.com',
              keyboardType: TextInputType.emailAddress,
              error: _emailError,
            ),
            VellinField(
              label: 'Текущий пароль',
              controller: _emailPassword,
              obscure: true,
              hint: 'Подтвердите, что это вы',
            ),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [SaveButton(
                state: _emailSave,
                label: 'Сменить почту',
                onPressed: _changeEmail,
                onSettled: () => setState(() => _emailSave = SaveState.idle),
              )],
            ),
          ],
        ),
        const SizedBox(height: VellinLayout.gapCard),
        VellinCard(
          title: 'Пароль',
          children: [
            VellinField(label: 'Текущий пароль', controller: _current, obscure: true),
            VellinField(
              label: 'Новый пароль',
              controller: _next,
              obscure: true,
              hint: 'От восьми символов',
              error: _passwordError,
            ),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [SaveButton(
                state: _passwordSave,
                label: 'Сменить пароль',
                onPressed: _changePassword,
                onSettled: () => setState(() => _passwordSave = SaveState.idle),
              )],
            ),
          ],
        ),
      ],
    );
  }
}
