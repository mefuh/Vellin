import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../state/auth_controller.dart';
import '../theme/vellin_theme.dart';
import '../widgets/common.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await context.read<AuthController>().login(_email.text.trim(), _password.text);
      if (mounted) context.go('/profile');
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Не удалось войти. Проверьте соединение.');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthShell(
      title: 'Войти в Vellin',
      subtitle: 'Email и пароль от вашего аккаунта.',
      footer: Wrap(
        alignment: WrapAlignment.center,
        children: [
          const Text('Нет аккаунта? ', style: TextStyle(color: VellinColors.text2, fontSize: 13)),
          GestureDetector(
            onTap: () => context.go('/register'),
            child: const Text('Зарегистрируйтесь',
                style: TextStyle(color: VellinColors.accentHi, fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
      children: [
        VellinField(label: 'Email', controller: _email, keyboardType: TextInputType.emailAddress, hint: 'you@example.com'),
        const SizedBox(height: 14),
        VellinField(label: 'Пароль', controller: _password, obscure: true, hint: '••••••••'),
        const SizedBox(height: 14),
        ErrorBanner(_error),
        if (_error != null) const SizedBox(height: 14),
        PrimaryButton(label: 'Войти', loading: _loading, onPressed: _submit),
      ],
    );
  }
}
