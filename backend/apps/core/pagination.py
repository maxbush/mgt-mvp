from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 500

    def get_paginated_response(self, data):
        from rest_framework.response import Response

        return Response({"count": self.page.paginator.count, "next": self.get_next_link(), "prev": self.get_previous_link(), "results": data})
