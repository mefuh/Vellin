import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../state/auth_controller.dart';
import '../theme/vellin_theme.dart';
import '../widgets/common.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _email = TextEditingController();
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<AuthController>().register(
            _email.text.trim(),
            _username.text.trim(),
            _password.text,
          );
      if (mounted) context.go('/profile');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Не удалось зарегистрироваться. Проверьте соединение.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthShell(
      title: 'Создать аккаунт',
      subtitle: 'Личная библиотека комнат и история просмотров.',
      footer: Wrap(
        alignment: WrapAlignment.center,
        children: [
          const Text('Уже есть аккаунт? ', style: TextStyle(color: VellinColors.text2, fontSize: 13)),
          GestureDetector(
            onTap: () => context.go('/login'),
            child: const Text('Войдите',
                style: TextStyle(color: VellinColors.accentHi, fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
      children: [
        VellinField(label: 'Имя пользователя', controller: _username, hint: 'vellin_fan'),
        const SizedBox(height: 14),
        VellinField(label: 'Email', controller: _email, keyboardType: TextInputType.emailAddress, hint: 'you@example.com'),
        const SizedBox(height: 14),
        VellinField(label: 'Пароль (от 8 символов)', controller: _password, obscure: true, hint: '••••••••'),
        const SizedBox(height: 14),
        ErrorBanner(_error),
        if (_error != null) const SizedBox(height: 14),
        PrimaryButton(label: 'Создать аккаунт', loading: _loading, onPressed: _submit),
      ],
    );
  }
}
