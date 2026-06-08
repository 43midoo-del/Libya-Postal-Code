<?php
/**
 * Base controller: shared view rendering and access guards.
 */
declare(strict_types=1);

namespace App\Controllers;

use App\SessionAuth;

abstract class BaseController
{
    protected function render(string $viewRelativePath, array $data = []): void
    {
        $appConfig = require dirname(__DIR__) . '/config/app.php';
        $data['appName'] = $appConfig['name'] ?? 'App';
        extract($data, EXTR_SKIP);
        $viewFile = dirname(__DIR__) . '/views/' . ltrim($viewRelativePath, '/');
        if (!is_file($viewFile)) {
            http_response_code(500);
            echo 'View not found.';
            return;
        }
        require $viewFile;
    }

    protected function redirect(string $url): void
    {
        header('Location: ' . $url, true, 302);
        exit;
    }

    protected function requireAuth(): void
    {
        if (!SessionAuth::isLoggedIn()) {
            $this->redirect('index.php?r=login');
        }
    }

    /**
     * @param list<string> $roles
     */
    protected function requireAnyRole(array $roles): void
    {
        $this->requireAuth();
        $userRole = SessionAuth::userRole();
        if (!in_array($userRole, $roles, true)) {
            http_response_code(403);
            $this->render('error/forbidden.php', [
                'message' => 'ليس لديك صلاحية لعرض هذه الصفحة.',
            ]);
            exit;
        }
    }

    /** JSON guard for fetch/XHR — avoids redirect HTML breaking client parsers. */
    protected function requireApiAuth(): void
    {
        if (!SessionAuth::isLoggedIn()) {
            $this->jsonError(401, 'غير مصرّح — الرجاء تسجيل الدخول مجدداً.');
        }
    }

    /**
     * @param list<string> $roles
     */
    protected function requireApiAnyRole(array $roles): void
    {
        $this->requireApiAuth();
        $userRole = SessionAuth::userRole();
        if (!in_array($userRole, $roles, true)) {
            $this->jsonError(403, 'ليس لديك صلاحية لهذا الإجراء.');
        }
    }

    protected function jsonError(int $code, string $message): void
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'message' => $message, 'rows' => []], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
