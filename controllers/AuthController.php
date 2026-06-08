<?php
/**
 * Authentication: login form, process credentials, logout.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Csrf;
use App\Flash;
use App\Models\User;
use App\SessionAuth;
use RuntimeException;

final class AuthController extends BaseController
{
    public function showLoginPage(?string $error = null): void
    {
        if (SessionAuth::isLoggedIn()) {
            $this->redirect('index.php?r=dashboard');
        }
        $this->render('auth/login.php', [
            'title'  => 'تسجيل الدخول',
            'error'  => $error,
            'csrf'   => Csrf::getToken(),
        ]);
    }

    public function processLogin(): void
    {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $this->redirect('index.php?r=login');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            $this->showLoginPage('انتهت صلاحية الجلسة. حدّث الصفحة وحاول مرة أخرى.');
            return;
        }
        $email = isset($_POST['email']) ? trim((string) $_POST['email']) : '';
        $password = $_POST['password'] ?? '';
        if ($email === '' || $password === '') {
            $this->showLoginPage('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
            return;
        }
        try {
            $user = User::findByEmail($email);
        } catch (\Throwable $e) {
            $app = require \APP_ROOT . '/config/app.php';
            $message = 'تعذّر الاتصال بقاعدة البيانات. تأكد من تشغيل MySQL وصحة config/database.php واستيراد database.sql.';
            if (($app['debug'] ?? false) === true || getenv('APP_DEBUG') === '1') {
                $message .= ' (' . $e->getMessage() . ')';
            }
            $this->showLoginPage($message);
            return;
        }
        if ($user === null || !password_verify((string) $password, $user->passwordHash)) {
            $this->showLoginPage('بيانات تسجيل الدخول غير صحيحة.');
            return;
        }
        SessionAuth::login($user->id, $user->name, $user->email, $user->role);
        $this->redirect('index.php?r=dashboard');
    }

    public function logout(): void
    {
        SessionAuth::logout();
        $this->redirect('index.php?r=login');
    }

    /**
     * Citizen self-registration. Role is forced to `citizen` regardless of any field
     * a malicious client may submit.
     */
    public function showRegisterPage(?string $error = null, array $old = []): void
    {
        if (SessionAuth::isLoggedIn()) {
            $this->redirect('index.php?r=dashboard');
        }
        $this->render('auth/register.php', [
            'title' => 'إنشاء حساب مواطن',
            'error' => $error,
            'old'   => $old,
            'csrf'  => Csrf::getToken(),
        ]);
    }

    public function processRegister(): void
    {
        if (SessionAuth::isLoggedIn()) {
            $this->redirect('index.php?r=dashboard');
        }
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $this->redirect('index.php?r=register');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            $this->showRegisterPage('انتهت صلاحية الجلسة. حدّث الصفحة وأعد المحاولة.');
            return;
        }
        $name    = trim((string) ($_POST['name'] ?? ''));
        $email   = trim((string) ($_POST['email'] ?? ''));
        $pwd     = (string) ($_POST['password'] ?? '');
        $pwdConf = (string) ($_POST['password_confirm'] ?? '');
        if ($pwd !== $pwdConf) {
            $this->showRegisterPage('تأكيد كلمة المرور لا يطابق.', ['name' => $name, 'email' => $email]);
            return;
        }
        try {
            $id = User::create($name, $email, $pwd, 'citizen');
            SessionAuth::login($id, $name, strtolower($email), 'citizen');
            Flash::set('مرحباً بك ' . $name . '. تم إنشاء الحساب بنجاح.', Flash::OK);
            $this->redirect('index.php?r=dashboard');
        } catch (RuntimeException $e) {
            $this->showRegisterPage($e->getMessage(), ['name' => $name, 'email' => $email]);
        }
    }
}
