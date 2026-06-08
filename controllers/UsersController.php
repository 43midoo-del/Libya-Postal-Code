<?php
/**
 * Admin-only user management: list / create / edit / delete + profile screens.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\Csrf;
use App\Flash;
use App\Models\User;
use App\SessionAuth;
use RuntimeException;

final class UsersController extends BaseController
{
    public function index(): void
    {
        $this->requireAnyRole(['admin']);
        $role = isset($_GET['role']) ? trim((string) $_GET['role']) : '';
        $q    = isset($_GET['q']) ? trim((string) $_GET['q']) : '';
        if ($role !== '' && !in_array($role, User::ROLES, true)) {
            $role = '';
        }
        $users = User::all(['role' => $role, 'q' => $q]);
        $this->render('users/index.php', [
            'title'         => 'إدارة المستخدمين',
            'users'         => $users,
            'filterRole'    => $role,
            'filterQ'       => $q,
            'userName'      => SessionAuth::userName(),
            'userRole'      => SessionAuth::userRole(),
            'navCurrent'    => 'users',
            'csrf'          => Csrf::getToken(),
            'flash'         => Flash::getAndClear(),
            'appShellClass' => 'app-shell--wide',
        ]);
    }

    public function newForm(): void
    {
        $this->requireAnyRole(['admin']);
        $this->render('users/create.php', [
            'title'      => 'إضافة مستخدم',
            'userName'   => SessionAuth::userName(),
            'userRole'   => SessionAuth::userRole(),
            'navCurrent' => 'users',
            'csrf'       => Csrf::getToken(),
            'flash'      => Flash::getAndClear(),
            'old'        => [],
        ]);
    }

    public function store(): void
    {
        $this->requireAnyRole(['admin']);
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->redirect('index.php?r=user_new');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            Flash::set('انتهت صلاحية الجلسة.', Flash::ERR);
            $this->redirect('index.php?r=user_new');
        }
        $name  = trim((string) ($_POST['name'] ?? ''));
        $email = trim((string) ($_POST['email'] ?? ''));
        $role  = trim((string) ($_POST['role'] ?? ''));
        $pwd   = (string) ($_POST['password'] ?? '');
        try {
            $id = User::create($name, $email, $pwd, $role);
            Flash::set('تم إنشاء المستخدم #' . (string) $id . '.', Flash::OK);
            $this->redirect('index.php?r=users');
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
            $this->render('users/create.php', [
                'title'      => 'إضافة مستخدم',
                'userName'   => SessionAuth::userName(),
                'userRole'   => SessionAuth::userRole(),
                'navCurrent' => 'users',
                'csrf'       => Csrf::getToken(),
                'flash'      => Flash::getAndClear(),
                'old'        => [
                    'name'  => $name,
                    'email' => $email,
                    'role'  => $role,
                ],
            ]);
        }
    }

    public function editForm(): void
    {
        $this->requireAnyRole(['admin']);
        $id   = (int) ($_GET['id'] ?? 0);
        $user = User::findById($id);
        if ($user === null) {
            Flash::set('المستخدم غير موجود.', Flash::ERR);
            $this->redirect('index.php?r=users');
        }
        $this->render('users/edit.php', [
            'title'      => 'تعديل المستخدم',
            'editUser'   => $user,
            'userName'   => SessionAuth::userName(),
            'userRole'   => SessionAuth::userRole(),
            'navCurrent' => 'users',
            'csrf'       => Csrf::getToken(),
            'flash'      => Flash::getAndClear(),
        ]);
    }

    public function update(): void
    {
        $this->requireAnyRole(['admin']);
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->redirect('index.php?r=users');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            Flash::set('انتهت صلاحية الجلسة.', Flash::ERR);
            $this->redirect('index.php?r=users');
        }
        $id    = (int) ($_POST['id'] ?? 0);
        $name  = trim((string) ($_POST['name'] ?? ''));
        $email = trim((string) ($_POST['email'] ?? ''));
        $role  = trim((string) ($_POST['role'] ?? ''));
        $pwd   = (string) ($_POST['password'] ?? '');
        try {
            $cur = User::findById($id);
            if ($cur === null) {
                throw new RuntimeException('المستخدم غير موجود.');
            }
            $isSelf = $cur->id === SessionAuth::userId();
            if ($isSelf && $role !== $cur->role && $cur->role === 'admin') {
                throw new RuntimeException('لا يمكنك تغيير دور حسابك الحالي من مدير إلى دور آخر.');
            }
            User::update($id, $name, $email, $role, $pwd === '' ? null : $pwd);
            if ($isSelf) {
                SessionAuth::login($cur->id, $name, strtolower($email), $role);
            }
            Flash::set('تم حفظ بيانات المستخدم.', Flash::OK);
            $this->redirect('index.php?r=users');
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
            $this->redirect('index.php?r=user_edit&id=' . (string) $id);
        }
    }

    public function delete(): void
    {
        $this->requireAnyRole(['admin']);
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->redirect('index.php?r=users');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            Flash::set('انتهت صلاحية الجلسة.', Flash::ERR);
            $this->redirect('index.php?r=users');
        }
        $id = (int) ($_POST['id'] ?? 0);
        if ($id === SessionAuth::userId()) {
            Flash::set('لا يمكنك حذف حسابك الحالي.', Flash::ERR);
            $this->redirect('index.php?r=users');
        }
        try {
            User::delete($id);
            Flash::set('تم حذف المستخدم.', Flash::OK);
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=users');
    }

    public function profile(): void
    {
        $this->requireAuth();
        $user = User::findById(SessionAuth::userId());
        if ($user === null) {
            SessionAuth::logout();
            $this->redirect('index.php?r=login');
        }
        $this->render('users/profile.php', [
            'title'      => 'الملف الشخصي',
            'profileUser' => $user,
            'userName'   => SessionAuth::userName(),
            'userRole'   => SessionAuth::userRole(),
            'navCurrent' => 'profile',
            'csrf'       => Csrf::getToken(),
            'flash'      => Flash::getAndClear(),
        ]);
    }

    public function profileUpdate(): void
    {
        $this->requireAuth();
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->redirect('index.php?r=profile');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            Flash::set('انتهت صلاحية الجلسة.', Flash::ERR);
            $this->redirect('index.php?r=profile');
        }
        $name  = trim((string) ($_POST['name'] ?? ''));
        $email = trim((string) ($_POST['email'] ?? ''));
        try {
            User::updateOwnProfile(SessionAuth::userId(), $name, $email);
            SessionAuth::login(SessionAuth::userId(), $name, strtolower($email), SessionAuth::userRole());
            Flash::set('تم تحديث بياناتك الشخصية.', Flash::OK);
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=profile');
    }

    public function profilePassword(): void
    {
        $this->requireAuth();
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->redirect('index.php?r=profile');
        }
        $token = $_POST['csrf_token'] ?? null;
        if (!Csrf::validate(is_string($token) ? $token : null)) {
            Flash::set('انتهت صلاحية الجلسة.', Flash::ERR);
            $this->redirect('index.php?r=profile');
        }
        $current = (string) ($_POST['current_password'] ?? '');
        $new     = (string) ($_POST['new_password'] ?? '');
        $confirm = (string) ($_POST['confirm_password'] ?? '');
        if ($new !== $confirm) {
            Flash::set('تأكيد كلمة المرور لا يطابق.', Flash::ERR);
            $this->redirect('index.php?r=profile');
        }
        try {
            User::changePassword(SessionAuth::userId(), $current, $new);
            Flash::set('تم تغيير كلمة المرور.', Flash::OK);
        } catch (RuntimeException $e) {
            Flash::set($e->getMessage(), Flash::ERR);
        }
        $this->redirect('index.php?r=profile');
    }
}
